import imageSize from "image-size";

import {
  isSnailArtAllowedExt,
  SNAIL_ART_CANVAS_PX,
  SNAIL_ART_ALLOWED_EXT,
  SNAIL_ART_MAX_FILE_BYTES,
} from "@/lib/snail-art-upload-spec";

export type SnailArtValidationOk = {
  ok: true;
  width: number;
  height: number;
};

export type SnailArtValidationErr = {
  ok: false;
  error: string;
};

export function validateSnailArtBuffer(
  buffer: Buffer,
  ext: string,
): SnailArtValidationOk | SnailArtValidationErr {
  if (!isSnailArtAllowedExt(ext)) {
    return {
      ok: false,
      error: `Unsupported type .${ext}. Allowed: ${SNAIL_ART_ALLOWED_EXT.join(", ")}.`,
    };
  }
  if (buffer.length > SNAIL_ART_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${SNAIL_ART_MAX_FILE_BYTES / (1024 * 1024)} MiB).`,
    };
  }

  let width: number | undefined;
  let height: number | undefined;
  try {
    const dim = imageSize(buffer);
    width = dim.width;
    height = dim.height;
  } catch {
    return {
      ok: false,
      error:
        "Could not read image dimensions. The file may be corrupt, or the SVG may be missing width/height or a square viewBox on the root <svg>.",
    };
  }

  if (
    width == null ||
    height == null ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return {
      ok: false,
      error: `Could not determine pixel size. For SVG, set width and height to ${SNAIL_ART_CANVAS_PX}px (or a square viewBox 0 0 ${SNAIL_ART_CANVAS_PX} ${SNAIL_ART_CANVAS_PX}) on the root element.`,
    };
  }

  if (width !== SNAIL_ART_CANVAS_PX || height !== SNAIL_ART_CANVAS_PX) {
    return {
      ok: false,
      error: `Canvas must be exactly ${SNAIL_ART_CANVAS_PX}×${SNAIL_ART_CANVAS_PX} px (got ${width}×${height}).`,
    };
  }

  return { ok: true, width, height };
}
