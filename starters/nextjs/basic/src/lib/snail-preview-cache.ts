import { getAdminBucket } from "@/lib/firebase-admin";
import {
  firebaseStorageDownloadUrl,
} from "@/lib/firebase-storage-url";

export type SnailPreviewSize = "badge" | "hero";

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

/** Reuse any cached preview PNG for this user + size (even if look fingerprint changed). */
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

/** Download cached preview bytes — does not require sharp. */
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
