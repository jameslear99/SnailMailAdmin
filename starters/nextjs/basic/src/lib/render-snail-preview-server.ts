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
import {
  compareSnailArtPaintOrder,
  SNAIL_ART_CATEGORIES,
  type SnailArtCategory,
} from "@/lib/snail-art-types";
import {
  layerAcceptsPreviewTint,
  tintForLayerFromColors,
  type PreviewSlotColors,
} from "@/lib/snail-preview-tint";
import {
  findCachedSnailPreviewUrl,
  cachedSnailPreviewMeetsSize,
  snailPreviewObjectPath,
  type SnailPreviewSize,
} from "@/lib/snail-preview-cache";
import { BADGE_SNAIL_PX, HERO_SNAIL_PX } from "@/lib/lob-letter-layout";
import { serializeDoc } from "@/lib/serialize-firestore";

export type { SnailPreviewSize } from "@/lib/snail-preview-cache";

const OUTPUT_PX: Record<SnailPreviewSize, number> = {
  badge: BADGE_SNAIL_PX,
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

type CatalogAsset = {
  id: string;
  category: SnailArtCategory;
  storagePath: string;
};

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickCatalogId(assets: CatalogAsset[], seed: string): string | undefined {
  if (assets.length === 0) return undefined;
  return assets[hashSeed(seed) % assets.length]!.id;
}

function snailIdFromProfile(profile: Record<string, unknown> | null, uid: string): string {
  const snail = profile?.snail;
  if (snail && typeof snail === "object" && !Array.isArray(snail)) {
    const id = (snail as Record<string, unknown>).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return uid;
}

async function loadPublishedCatalogAssets(db: Firestore): Promise<Map<SnailArtCategory, CatalogAsset[]>> {
  const snap = await db.collection("snailArtAssets").limit(500).get();
  const byCategory = new Map<SnailArtCategory, CatalogAsset[]>();
  for (const cat of SNAIL_ART_CATEGORIES) byCategory.set(cat, []);

  for (const doc of snap.docs) {
    const data = doc.data();
    const category = data.category as string | undefined;
    const storagePath = typeof data.storagePath === "string" ? data.storagePath.trim() : "";
    const status = data.status as string | undefined;
    if (!category || !SNAIL_ART_CATEGORIES.includes(category as SnailArtCategory)) continue;
    if (!storagePath) continue;
    if (status && status !== "published") continue;
    byCategory.get(category as SnailArtCategory)!.push({
      id: doc.id,
      category: category as SnailArtCategory,
      storagePath,
    });
  }
  return byCategory;
}

/**
 * Fill missing catalog IDs the same way the Flutter app does at display time
 * (`SnailArtCatalog.resolveLook`) so Lob can still composite a real snail.
 */
async function completeLookFromCatalog(
  db: Firestore,
  look: ParsedSnailLook | null,
  seed: string,
): Promise<ParsedSnailLook | null> {
  const required: SnailArtCategory[] = ["antenna", "body", "shell", "face"];
  const missing = !look || required.some((cat) => {
    const id =
      cat === "antenna" ? look.antennaAssetId :
      cat === "body" ? look.bodyAssetId :
      cat === "shell" ? look.shellAssetId :
      look.faceAssetId;
    return !id;
  });
  if (look && !missing) return look;

  const byCategory = await loadPublishedCatalogAssets(db);
  const pick = (cat: SnailArtCategory, current?: string): string => {
    if (current) return current;
    return pickCatalogId(byCategory.get(cat) ?? [], `${seed}:${cat}`) ?? "";
  };

  const antennaAssetId = pick("antenna", look?.antennaAssetId);
  const bodyAssetId = pick("body", look?.bodyAssetId);
  const shellAssetId = pick("shell", look?.shellAssetId);
  const faceAssetId = pick("face", look?.faceAssetId);
  if (!antennaAssetId || !bodyAssetId || !shellAssetId || !faceAssetId) return look;

  return {
    antennaAssetId,
    bodyAssetId,
    shellAssetId,
    faceAssetId,
    accessoryAssetId: look?.accessoryAssetId,
    antennaColor: look?.antennaColor ?? "#6e8b5e",
    bodyColor: look?.bodyColor ?? "#6e8b5e",
    shellColor: look?.shellColor ?? "#8b9e7a",
  };
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
        storagePath: typeof data.storagePath === "string" ? data.storagePath.trim() : "",
        fileFormat: (data.fileFormat as string | undefined) ?? "png",
      };
    })
    .filter((layer) => layer.storagePath.length > 0)
    .sort(compareSnailArtPaintOrder);

  if (layers.length === 0) {
    throw new Error("No snail art layers found");
  }

  const composites = await Promise.all(
    layers.map(async (layer) => {
      const tint = layerAcceptsPreviewTint(layer, policy)
        ? tintForLayerFromColors(layer, colors, policy)
        : null;
      const input = await layerPngBuffer(layer.storagePath, layer.fileFormat, px, tint);
      return { input, top: 0, left: 0 };
    }),
  );

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
  let look = parseSnailLookFromProfile(profile);
  look = await completeLookFromCatalog(db, look, snailIdFromProfile(profile, trimmed));
  if (!look) return null;

  const fingerprint = snailLookFingerprint(look);
  const bucket = getAdminBucket();
  const objectPath = storagePathFor(trimmed, size, fingerprint);
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (exists) {
    try {
      const [buf] = await file.download();
      if (cachedSnailPreviewMeetsSize(buf, size)) return buf;
    } catch (e) {
      console.error(`[lob-snail] cache download failed for ${trimmed} (${size})`, e);
    }
  }

  const png = await compositeSnailPng(db, look, size);
  try {
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
  } catch (e) {
    // Still return the composite — a cache write must not drop the snail from the letter.
    console.error(`[lob-snail] cache save failed for ${trimmed} (${size})`, e);
  }

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
