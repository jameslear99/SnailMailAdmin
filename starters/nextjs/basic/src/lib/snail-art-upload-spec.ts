/**
 * Canonical canvas for each layered snail piece (square).
 *
 * Production art is delivered at 1500×1500 px (PNG with transparency, or SVG
 * with a matching square viewBox). The Flutter app scales layers down at render
 * time, so a larger source keeps edges crisp on high-DPI screens.
 */
export const SNAIL_ART_CANVAS_PX = 1500;

/** Vector + raster with reliable alpha. */
export const SNAIL_ART_ALLOWED_EXT = ["svg", "png"] as const;

export type SnailArtAllowedExt = (typeof SNAIL_ART_ALLOWED_EXT)[number];

/** Per-file byte limit before decoding dimensions (1500² PNGs can be several MiB). */
export const SNAIL_ART_MAX_FILE_BYTES = 8 * 1024 * 1024;

export function isSnailArtAllowedExt(ext: string): ext is SnailArtAllowedExt {
  return (SNAIL_ART_ALLOWED_EXT as readonly string[]).includes(ext);
}

export function snailArtExtFromFilename(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : "";
}

export function snailArtRequirementSummary(): string {
  return `Exactly ${SNAIL_ART_CANVAS_PX}×${SNAIL_ART_CANVAS_PX}px square, ${SNAIL_ART_ALLOWED_EXT.join(" or ")} only, max ${Math.round(SNAIL_ART_MAX_FILE_BYTES / (1024 * 1024))} MiB per file. PNG layers should use a transparent background; center the artwork in the canvas.`;
}
