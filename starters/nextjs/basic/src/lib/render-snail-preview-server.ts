import "server-only";

import { createHash } from "crypto";

import sharp from "sharp";

import type { Firestore } from "firebase-admin/firestore";

import { getAdminBucket } from "@/lib/firebase-admin";
import {
  firebaseStorageDownloadUrl,
  newFirebaseStorageDownloadToken,
} from "@/lib/firebase-storage-url";
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
import { serializeDoc } from "@/lib/serialize-firestore";

export type SnailPreviewSize = "badge" | "hero";

const OUTPUT_PX: Record<SnailPreviewSize, number> = {
  badge: 256,
  hero: 420,
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
  const pub = await db.collection("publicProfiles").doc(uid).get();
  if (pub.exists) return serializeDoc(pub.data())!;

  const user = await db.collection("users").doc(uid).get();
  if (!user.exists) return null;
  const data = serializeDoc(user.data())!;
  const snail = data.snail;
  if (snail && typeof snail === "object") {
    return { snail };
  }
  return null;
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
  const hash = createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
  return `snail-previews/${uid}/${size}-${hash}.png`;
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
    const [meta] = await file.getMetadata();
    const token =
      meta.metadata?.firebaseStorageDownloadTokens ??
      meta.metadata?.["firebaseStorageDownloadTokens"];
    if (typeof token === "string" && token.trim()) {
      return firebaseStorageDownloadUrl(bucket.name, objectPath, token.trim());
    }
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

  return firebaseStorageDownloadUrl(bucket.name, objectPath, downloadToken);
}
