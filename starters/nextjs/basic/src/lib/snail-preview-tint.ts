import type { SnailArtCategory } from "@/lib/snail-art-types";
import type { SnailArtRecolorPolicy } from "@/lib/snail-art-recolor-policy";
import { categoryAllowsRecolor, layerIsRecolorable } from "@/lib/snail-art-recolor-policy";

/** Hex `#rrggbb` modulate tint, or `null` to keep source art colors. */
export type SnailPreviewTint = string | null;

/** Player-facing tint slots — matches Flutter [SnailLook.tintFor]. */
export type PreviewSlotColors = {
  body: string;
  shell: string;
  antenna: string;
};

/** Earthy catalog palette (aligned with in-app snail generation). */
export const PREVIEW_BODY_PALETTE = [
  "#11935B",
  "#0D7549",
  "#E7F4EE",
  "#E6EEFE",
  "#FFC93D",
  "#E6E6EB",
  "#6E7079",
] as const;

export const PREVIEW_SHELL_PALETTE = [
  "#FFC93D",
  "#D9362F",
  "#11935B",
  "#0D7549",
  "#E6EEFE",
  "#6E7079",
  "#8B6914",
  "#A0522D",
] as const;

export const PREVIEW_ANTENNA_PALETTE = [
  "#FFC93D",
  "#D9362F",
  "#11935B",
  "#6E7079",
  "#0D7549",
  "#11935B",
] as const;

export const DEFAULT_PREVIEW_COLORS: PreviewSlotColors = {
  body: PREVIEW_BODY_PALETTE[0],
  shell: PREVIEW_SHELL_PALETTE[0],
  antenna: PREVIEW_ANTENNA_PALETTE[0],
};

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function randomPreviewSlotColors(): PreviewSlotColors {
  return {
    body: pickRandom(PREVIEW_BODY_PALETTE),
    shell: pickRandom(PREVIEW_SHELL_PALETTE),
    antenna: pickRandom(PREVIEW_ANTENNA_PALETTE),
  };
}

/** Whether a layer accepts a modulate tint in preview / the Flutter app. */
export function layerAcceptsPreviewTint(
  layer: { category?: string; recolorable?: boolean },
  policy: SnailArtRecolorPolicy,
): boolean {
  if (!layerIsRecolorable(policy, layer)) return false;
  const cat = layer.category as SnailArtCategory | undefined;
  return cat === "body" || cat === "shell" || cat === "antenna";
}

export function tintForLayerFromColors(
  layer: { category?: string; recolorable?: boolean },
  colors: PreviewSlotColors,
  policy: SnailArtRecolorPolicy,
): SnailPreviewTint {
  if (!layerAcceptsPreviewTint(layer, policy)) return null;
  const cat = layer.category as SnailArtCategory;
  if (cat === "body") return colors.body;
  if (cat === "shell") return colors.shell;
  if (cat === "antenna") return colors.antenna;
  return null;
}

export function tintsForLayersFromColors(
  layers: Array<{ category?: string; recolorable?: boolean }>,
  colors: PreviewSlotColors,
  policy: SnailArtRecolorPolicy,
): SnailPreviewTint[] {
  return layers.map((layer) => tintForLayerFromColors(layer, colors, policy));
}

/**
 * Flutter `ColorFilter.mode(color, BlendMode.modulate)` — multiplies RGB by the tint.
 * Works naturally when source art is grayscale or a neutral mid-tone; pre-colored
 * layers (e.g. a purple body PNG) will not shift cleanly to unrelated hues.
 */
export function applyModulateTintToImageData(imageData: ImageData, tintHex: string): void {
  const tr = parseInt(tintHex.slice(1, 3), 16);
  const tg = parseInt(tintHex.slice(3, 5), 16);
  const tb = parseInt(tintHex.slice(5, 7), 16);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = Math.round((data[i]! * tr) / 255);
    data[i + 1] = Math.round((data[i + 1]! * tg) / 255);
    data[i + 2] = Math.round((data[i + 2]! * tb) / 255);
  }
}

export function previewColorLabel(slot: keyof PreviewSlotColors): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}
