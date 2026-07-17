import { apiFetch } from "@/lib/api-fetch";
import { SNAIL_ART_CANVAS_PX } from "@/lib/snail-art-upload-spec";
import {
  applyModulateTintToImageData,
  type SnailPreviewTint,
} from "@/lib/snail-preview-tint";

export type SnailPreviewLayerInput = {
  id: string;
  slug?: string;
};

const layerImageCache = new Map<string, Promise<HTMLImageElement>>();

function loadLayerImage(layerId: string): Promise<HTMLImageElement> {
  const cached = layerImageCache.get(layerId);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    void (async () => {
      try {
        const res = await apiFetch(`/api/snail-art-assets/${encodeURIComponent(layerId)}/media`);
        if (!res.ok) {
          throw new Error(`Failed to load layer ${layerId}`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          layerImageCache.delete(layerId);
          reject(new Error(`Failed to decode layer ${layerId}`));
        };
        img.src = objectUrl;
      } catch (e) {
        layerImageCache.delete(layerId);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });

  layerImageCache.set(layerId, promise);
  return promise;
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  tint: SnailPreviewTint,
  size: number,
): void {
  if (!tint) {
    ctx.drawImage(img, 0, 0, size, size);
    return;
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) {
    throw new Error("Canvas not supported");
  }

  offCtx.drawImage(img, 0, 0, size, size);
  const imageData = offCtx.getImageData(0, 0, size, size);
  applyModulateTintToImageData(imageData, tint);
  offCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(offscreen, 0, 0);
}

/** Composite preview layers onto [canvas] at the given square size. */
export async function renderSnailPreview(
  canvas: HTMLCanvasElement,
  layers: SnailPreviewLayerInput[],
  tints: SnailPreviewTint[],
  size: number,
): Promise<void> {
  if (layers.length === 0) {
    throw new Error("No layers to render");
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const offCtx = offscreen.getContext("2d");
  if (!offCtx) {
    throw new Error("Canvas not supported");
  }

  offCtx.clearRect(0, 0, size, size);
  const images = await Promise.all(layers.map((layer) => loadLayerImage(layer.id)));

  for (let i = 0; i < images.length; i++) {
    drawLayer(offCtx, images[i]!, tints[i] ?? null, size);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported");
  }

  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(offscreen, 0, 0);
}

/** Composite preview layers into a single PNG at catalog canvas size (1500×1500). */
export async function renderSnailPreviewPng(
  layers: SnailPreviewLayerInput[],
  tints: SnailPreviewTint[],
  size = SNAIL_ART_CANVAS_PX,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderSnailPreview(canvas, layers, tints, size);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export PNG"));
      },
      "image/png",
    );
  });
}

export function snailPreviewDownloadFilename(layers: SnailPreviewLayerInput[]): string {
  const parts = layers.map((layer) => layer.slug?.trim() || layer.id.slice(0, 8)).filter(Boolean);
  const base = parts.length > 0 ? parts.join("-") : "snail-preview";
  const safe = base.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 120);
  return `${safe}.png`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
