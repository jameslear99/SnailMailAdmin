import "server-only";

import { createHash } from "crypto";

import { getAdminBucket } from "@/lib/firebase-admin";
import {
  firebaseStorageDownloadUrl,
} from "@/lib/firebase-storage-url";
import {
  BADGE_SNAIL_PX,
  HERO_SNAIL_PX,
  type SnailPreviewSize,
} from "@/lib/lob-letter-layout";

export type { SnailPreviewSize } from "@/lib/lob-letter-layout";
export { HERO_SNAIL_PX } from "@/lib/lob-letter-layout";

export function snailPreviewObjectPath(
  uid: string,
  size: SnailPreviewSize,
  lookFingerprint: string,
): string {
  const trimmed = uid.trim();
  const hash = createHash("sha256").update(lookFingerprint).digest("hex").slice(0, 16);
  return `snail-previews/${trimmed}/${size}-${hash}.png`;
}

async function downloadUrlForObject(objectPath: string): Promise<string | null> {
  const bucket = getAdminBucket();
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

/** Cached preview for the user's current look fingerprint only. */
export async function findCachedSnailPreviewUrlForLook(
  uid: string,
  size: SnailPreviewSize,
  lookFingerprint: string,
): Promise<string | null> {
  const trimmed = uid.trim();
  if (!trimmed || !lookFingerprint.trim()) return null;
  return downloadUrlForObject(snailPreviewObjectPath(trimmed, size, lookFingerprint));
}

/** Download cached preview bytes for a specific look fingerprint — does not require sharp. */
export async function readCachedSnailPreviewPngForLook(
  uid: string,
  size: SnailPreviewSize,
  lookFingerprint: string,
): Promise<Buffer | null> {
  const trimmed = uid.trim();
  if (!trimmed || !lookFingerprint.trim()) return null;

  const bucket = getAdminBucket();
  const file = bucket.file(snailPreviewObjectPath(trimmed, size, lookFingerprint));
  const [exists] = await file.exists();
  if (!exists) return null;

  const [buf] = await file.download();
  return buf;
}

/** @deprecated Prefer fingerprint-aware helpers — may return a stale look. */
export async function findCachedSnailPreviewUrl(
  uid: string,
  size: SnailPreviewSize,
): Promise<string | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  const bucket = getAdminBucket();
  const [files] = await bucket.getFiles({
    prefix: `snail-previews/${trimmed}/${size}-`,
    maxResults: 1,
  });
  const match = files[0];
  if (!match) return null;
  return downloadUrlForObject(match.name);
}

/** @deprecated Prefer readCachedSnailPreviewPngForLook — may return a stale look. */
export async function readCachedSnailPreviewPng(
  uid: string,
  size: SnailPreviewSize,
): Promise<Buffer | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  const bucket = getAdminBucket();
  const [files] = await bucket.getFiles({
    prefix: `snail-previews/${trimmed}/${size}-`,
    maxResults: 1,
  });
  const match = files[0];
  if (!match) return null;

  const [buf] = await bucket.file(match.name).download();
  return buf;
}

export function pngBufferToDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString("base64")}`;
}

const MIN_PX: Record<SnailPreviewSize, number> = {
  badge: BADGE_SNAIL_PX,
  hero: HERO_SNAIL_PX,
};

/** Read PNG IHDR width/height without sharp. */
export function pngPixelSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(pngSig)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Reject stale hero/badge caches rendered at a smaller pixel size. */
export function cachedSnailPreviewMeetsSize(buf: Buffer, size: SnailPreviewSize): boolean {
  const dims = pngPixelSize(buf);
  if (!dims) return false;
  const minPx = MIN_PX[size];
  return dims.width >= minPx && dims.height >= minPx;
}
