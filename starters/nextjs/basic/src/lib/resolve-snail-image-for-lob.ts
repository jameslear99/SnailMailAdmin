import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import {
  findCachedSnailPreviewUrl,
  pngBufferToDataUrl,
  readCachedSnailPreviewPng,
  type SnailPreviewSize,
} from "@/lib/snail-preview-cache";

type SnailPreviewModule = typeof import("@/lib/render-snail-preview-server");

let cachedPreviewModule: SnailPreviewModule | null | undefined;

async function loadSnailPreviewModule(): Promise<SnailPreviewModule | null> {
  if (cachedPreviewModule !== undefined) return cachedPreviewModule;
  try {
    cachedPreviewModule = await import("@/lib/render-snail-preview-server");
    return cachedPreviewModule;
  } catch (e) {
    console.error("[lob-snail] failed to load snail preview render module", e);
    cachedPreviewModule = null;
    return null;
  }
}

function sizesToTry(preferred: SnailPreviewSize): SnailPreviewSize[] {
  return preferred === "hero" ? ["hero", "badge"] : [preferred];
}

/**
 * Resolve a snail image for Lob letter HTML as an inline data URL when possible.
 * Lob's renderer is more reliable with embedded images than Firebase token URLs.
 * Falls back to HTTPS cache URLs, then null (placeholder in HTML).
 */
export async function resolveSnailImageForLob(
  db: Firestore,
  uid: string,
  preferredSize: SnailPreviewSize,
): Promise<string | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  const sizes = sizesToTry(preferredSize);
  const preview = await loadSnailPreviewModule();

  if (preview) {
    for (const size of sizes) {
      try {
        const png = await preview.resolveSnailPreviewPng(db, trimmed, size);
        if (png?.length) return pngBufferToDataUrl(png);
      } catch (e) {
        console.error(`[lob-snail] preview render failed for ${trimmed} (${size})`, e);
      }
    }
  }

  for (const size of sizes) {
    try {
      const cachedPng = await readCachedSnailPreviewPng(trimmed, size);
      if (cachedPng?.length) return pngBufferToDataUrl(cachedPng);
    } catch (e) {
      console.error(`[lob-snail] cached PNG read failed for ${trimmed} (${size})`, e);
    }

    try {
      const cachedUrl = await findCachedSnailPreviewUrl(trimmed, size);
      if (cachedUrl) return cachedUrl;
    } catch (e) {
      console.error(`[lob-snail] cached URL lookup failed for ${trimmed} (${size})`, e);
    }
  }

  return null;
}
