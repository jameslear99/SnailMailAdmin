import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { loadProfileForSnailPreview } from "@/lib/load-snail-profile-for-preview";
import { parseSnailLookFromProfile, snailLookFingerprint } from "@/lib/parse-snail-look";
import { resolveSnailPreviewPng } from "@/lib/render-snail-preview-server";
import {
  cachedSnailPreviewMeetsSize,
  findCachedSnailPreviewUrlForLook,
  pngBufferToDataUrl,
  readBestCachedSnailPreviewPng,
  readCachedSnailPreviewPngForLook,
  type SnailPreviewSize,
} from "@/lib/snail-preview-cache";

function sizesToTry(preferred: SnailPreviewSize): SnailPreviewSize[] {
  // Cover snail displays large — never substitute a 256px badge (looks blurry in PDF).
  // Sender badges are shown at 56px, so a hero PNG is an acceptable fallback.
  if (preferred === "hero") return ["hero"];
  return ["badge", "hero"];
}

function pngUsableFor(preferred: SnailPreviewSize, png: Buffer): boolean {
  return cachedSnailPreviewMeetsSize(png, preferred === "hero" ? "hero" : "badge");
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

  const sizes = sizesToTry(preferredSize);

  for (const size of sizes) {
    try {
      const png = await resolveSnailPreviewPng(db, trimmed, size);
      if (png?.length && pngUsableFor(preferredSize, png)) {
        return pngBufferToDataUrl(png);
      }
    } catch (e) {
      console.error(`[lob-snail] preview render failed for ${trimmed} (${size})`, e);
    }
  }

  const profile = await loadProfileForSnailPreview(db, trimmed);
  const look = parseSnailLookFromProfile(profile);
  const fingerprint = look ? snailLookFingerprint(look) : "";

  if (fingerprint) {
    for (const size of sizes) {
      try {
        const cachedPng = await readCachedSnailPreviewPngForLook(trimmed, size, fingerprint);
        if (cachedPng?.length && pngUsableFor(preferredSize, cachedPng)) {
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
  }

  try {
    const anyCached = await readBestCachedSnailPreviewPng(trimmed, preferredSize);
    if (anyCached?.length && pngUsableFor(preferredSize, anyCached)) {
      return pngBufferToDataUrl(anyCached);
    }
  } catch (e) {
    console.error(`[lob-snail] any-cache PNG read failed for ${trimmed}`, e);
  }

  return null;
}
