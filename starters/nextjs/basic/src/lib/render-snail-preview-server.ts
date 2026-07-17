import "server-only";

import sharp from "sharp";

import type { Firestore } from "firebase-admin/firestore";

import { getAdminBucket } from "@/lib/firebase-admin";
import {
  firebaseStorageDownloadUrl,
  newFirebaseStorageDownloadToken,
} from "@/lib/firebase-storage-url";
import { loadProfileForSnailPreview } from "@/lib/load-snail-profile-for-preview";
import {
  parseSnailLookFromProfile,
  snailLookFingerprint,
  type ParsedSnailLook,
} from "@/lib/parse-snail-look";
import { parseSnailArtRecolorPolicy } from "@/lib/snail-art-recolor-policy";
import { compareSnailArtPaintOrder } from "@/lib/snail-art-types";
import {
  layerAcceptsPreviewTint,
  tintForLayerFromColors,
  type PreviewSlotColors,
} from "@/lib/snail-preview-tint";
import {
  findCachedSnailPreviewUrl,
  cachedSnailPreviewMeetsSize,
  HERO_SNAIL_PX,
  snailPreviewObjectPath,
  type SnailPreviewSize,
} from "@/lib/snail-preview-cache";
import { serializeDoc } from "@/lib/serialize-firestore";

export type { SnailPreviewSize } from "@/lib/snail-preview-cache";

const OUTPUT_PX: Record<SnailPreviewSize, number> = {
  badge: 256,
  hero: HERO_SNAIL_PX,
};

function applyModulateTintToRgba(data: Uint8Array, tintHex: string): void {
  const tr = parseInt(tintHex.slice(1, 3), 16);
  const tg = parseInt(tintHex.slice(3, 5), 16);
  const tb = parseInt(tintHex.slice(5, 7), 16);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.round((data[i]! * tr) / 255);
    data[i + 1] = Math.round((data[i + 1]! * tg) / 255);
    data[i + 2] = Math.round((data[i + 2]! * tb) / 255);
  }
}

async function layerPngBuffer(
  storagePath: string,
  fileFormat: string,
  size: number,
  tintHex: string | null,
): Promise<Buffer> {
  const [raw] = await getAdminBucket().file(storagePath).download();
  let pipeline = sharp(raw, fileFormat === "svg" ? { density: 150 } : undefined)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha();

  if (tintHex) {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const rgba = new Uint8Array(data);
    applyModulateTintToRgba(rgba, tintHex);
    pipeline = sharp(Buffer.from(rgba), {
      raw: { width: info.width, height: info.height, channels: 4 },
    });
  }

  return pipeline.png().toBuffer();
}

async function loadRecolorPolicy(db: Firestore) {
  const snap = await db.collection("adminSettings").doc("snailArtRecolorPolicy").get();
  return parseSnailArtRecolorPolicy(serializeDoc(snap.data() ?? undefined) ?? undefined);
}

async function loadProfileForUid(
  db: Firestore,
  uid: string,
): Promise<Record<string, unknown> | null> {
  return loadProfileForSnailPreview(db, uid);
}

async function downloadUrlForCachedFile(
  bucket: ReturnType<typeof getAdminBucket>,
  objectPath: string,
): Promise<string | null> {
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;

  const [meta] = await file.getMetadata();
  const token =
    meta.metadata?.firebaseStorageDownloadTokens ??
    meta.metadata?.["firebaseStorageDownloadTokens"];
  if (typeof token === "string" && token.trim()) {
    return firebaseStorageDownloadUrl(bucket.name, objectPath, token.trim());
  }
  return null;
}

/** @deprecated Use findCachedSnailPreviewUrl from `@/lib/snail-preview-cache`. */
export async function findExistingSnailPreviewUrl(
  uid: string,
  size: SnailPreviewSize,
): Promise<string | null> {
  return findCachedSnailPreviewUrl(uid, size);
}

async function compositeSnailPng(
  db: Firestore,
  look: ParsedSnailLook,
  size: SnailPreviewSize,
): Promise<Buffer> {
  const px = OUTPUT_PX[size];
  const policy = await loadRecolorPolicy(db);
  const colors: PreviewSlotColors = {
    body: look.bodyColor,
    shell: look.shellColor,
    antenna: look.antennaColor,
  };

  const assetIds = [
    look.antennaAssetId,
    look.bodyAssetId,
    look.shellAssetId,
    look.faceAssetId,
    ...(look.accessoryAssetId ? [look.accessoryAssetId] : []),
  ];

  const assetSnaps = await Promise.all(
    assetIds.map((id) => db.collection("snailArtAssets").doc(id).get()),
  );

  const layers = assetSnaps
    .filter((s) => s.exists)
    .map((s) => {
      const data = s.data()!;
      return {
        id: s.id,
        category: data.category as string | undefined,
        recolorable: data.recolorable as boolean | undefined,
        stackOrder: data.stackOrder as number | undefined,
        storagePath: data.storagePath as string,
        fileFormat: (data.fileFormat as string | undefined) ?? "png",
      };
    })
    .sort(compareSnailArtPaintOrder);

  if (layers.length === 0) {
    throw new Error("No snail art layers found");
  }

  const composites: { input: Buffer; top: number; left: number }[] = [];
  for (const layer of layers) {
    const tint = layerAcceptsPreviewTint(layer, policy)
      ? tintForLayerFromColors(layer, colors, policy)
      : null;
    const input = await layerPngBuffer(layer.storagePath, layer.fileFormat, px, tint);
    composites.push({ input, top: 0, left: 0 });
  }

  return sharp({
    create: {
      width: px,
      height: px,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

function storagePathFor(uid: string, size: SnailPreviewSize, fingerprint: string): string {
  return snailPreviewObjectPath(uid, size, fingerprint);
}

/** Composited PNG bytes — renders and caches in Storage when needed. */
export async function resolveSnailPreviewPng(
  db: Firestore,
  uid: string,
  size: SnailPreviewSize,
): Promise<Buffer | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  const profile = await loadProfileForUid(db, trimmed);
  const look = parseSnailLookFromProfile(profile);
  if (!look) return null;

  const fingerprint = snailLookFingerprint(look);
  const bucket = getAdminBucket();
  const objectPath = storagePathFor(trimmed, size, fingerprint);
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (exists) {
    const [buf] = await file.download();
    if (cachedSnailPreviewMeetsSize(buf, size)) return buf;
  }

  const png = await compositeSnailPng(db, look, size);
  const downloadToken = newFirebaseStorageDownloadToken();
  await file.save(png, {
    metadata: {
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        uid: trimmed,
        size,
      },
    },
  });

  return png;
}

/**
 * Returns a public HTTPS URL for a user's composited snail artwork.
 * Renders and caches in Firebase Storage when needed.
 */
export async function resolveSnailPreviewUrl(
  db: Firestore,
  uid: string,
  size: SnailPreviewSize,
): Promise<string | null> {
  const png = await resolveSnailPreviewPng(db, uid, size);
  if (!png) return null;

  const trimmed = uid.trim();
  const profile = await loadProfileForUid(db, trimmed);
  const look = parseSnailLookFromProfile(profile);
  if (!look) return null;

  const objectPath = storagePathFor(trimmed, size, snailLookFingerprint(look));
  return downloadUrlForCachedFile(getAdminBucket(), objectPath);
}
