/** URL-safe slug for `snailArtAssets` — matches server upload normalization. */
export function normalizeSnailArtSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new Error("invalid slug");
  return s;
}

/** Slug suggestion from filename stem; never throws (fallback is `layer-{n}`). */
export function suggestedSlugFromStem(stem: string, index: number): string {
  const s = stem
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s) return s;
  return `layer-${index + 1}`;
}

export function displayNameFromFilenameStem(stem: string, index: number): string {
  const pretty = stem.replace(/[-_]+/g, " ").trim();
  if (pretty) return pretty;
  return `Layer ${index + 1}`;
}
