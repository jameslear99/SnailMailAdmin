import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { loadProfileForSnailPreview } from "@/lib/load-snail-profile-for-preview";
import { parseSnailLookFromProfile, snailLookFingerprint } from "@/lib/parse-snail-look";
import {
  cachedSnailPreviewMeetsSize,
  findCachedSnailPreviewUrlForLook,
  pngBufferToDataUrl,
  readCachedSnailPreviewPngForLook,
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
  // Cover snail displays large — never substitute a 256px badge (looks blurry in PDF).
  if (preferred === "hero") return ["hero"];
  return [preferred];
}

/**
 * Resolve a snail image for Lob letter HTML as an inline data URL when possible.
 * Reads the user's current snail look from Firestore and uses a fingerprinted cache key.
 */
export async function resolveSnailImageForLob(
  db: Firestore,
  uid: string,
  preferredSize: SnailPreviewSize,
): Promise<string | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  const profile = await loadProfileForSnailPreview(db, trimmed);
  const look = parseSnailLookFromProfile(profile);
  if (!look) return null;

  const fingerprint = snailLookFingerprint(look);
  const sizes = sizesToTry(preferredSize);
  const preview = await loadSnailPreviewModule();

  if (preview) {
    for (const size of sizes) {
      try {
        const png = await preview.resolveSnailPreviewPng(db, trimmed, size);
        if (png?.length && cachedSnailPreviewMeetsSize(png, size)) {
          return pngBufferToDataUrl(png);
        }
      } catch (e) {
        console.error(`[lob-snail] preview render failed for ${trimmed} (${size})`, e);
      }
    }
  }

  for (const size of sizes) {
    try {
      const cachedPng = await readCachedSnailPreviewPngForLook(trimmed, size, fingerprint);
      if (cachedPng?.length && cachedSnailPreviewMeetsSize(cachedPng, size)) {
        return pngBufferToDataUrl(cachedPng);
      }
    } catch (e) {
      console.error(`[lob-snail] cached PNG read failed for ${trimmed} (${size})`, e);
    }

    try {
      const cachedUrl = await findCachedSnailPreviewUrlForLook(trimmed, size, fingerprint);
      if (cachedUrl) return cachedUrl;
    } catch (e) {
      console.error(`[lob-snail] cached URL lookup failed for ${trimmed} (${size})`, e);
    }
  }

  return null;
}
