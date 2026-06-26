import {
  isSnailArtAllowedExt,
  snailArtExtFromFilename,
  SNAIL_ART_CANVAS_PX,
  SNAIL_ART_ALLOWED_EXT,
  SNAIL_ART_MAX_FILE_BYTES,
} from "@/lib/snail-art-upload-spec";

export type SnailArtClientValidation =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

/** Sample alpha channel — full scan is fine at 1500×1500 in the admin browser. */
async function pngMayLackTransparency(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 250) return false;
    }
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function validateSnailArtFileForUpload(
  file: File,
): Promise<SnailArtClientValidation> {
  const ext = snailArtExtFromFilename(file.name);
  if (!isSnailArtAllowedExt(ext)) {
    return {
      ok: false,
      error: `Use ${SNAIL_ART_ALLOWED_EXT.join(" or ")} only.`,
    };
  }
  if (file.size > SNAIL_ART_MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${SNAIL_ART_MAX_FILE_BYTES / (1024 * 1024)} MiB).`,
    };
  }

  const warnings: string[] = [];

  if (ext === "png") {
    const url = URL.createObjectURL(file);
    try {
      const { width, height } = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("decode"));
          img.src = url;
        },
      );
      if (width !== SNAIL_ART_CANVAS_PX || height !== SNAIL_ART_CANVAS_PX) {
        return {
          ok: false,
          error: `Canvas must be ${SNAIL_ART_CANVAS_PX}×${SNAIL_ART_CANVAS_PX} px (this file is ${width}×${height}).`,
        };
      }
      if (await pngMayLackTransparency(file)) {
        warnings.push(
          "This PNG looks fully opaque. Layered snail art should use a transparent background outside the artwork.",
        );
      }
      return { ok: true, warnings };
    } catch {
      return {
        ok: false,
        error: "Could not read this PNG. The file may be corrupt or not a valid image.",
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // SVG dimension checks are enforced server-side (image-size); allow pick here.
  return { ok: true, warnings };
}
