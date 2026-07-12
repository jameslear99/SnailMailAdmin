import {
  SNAIL_ART_CATEGORIES,
  type SnailArtCategory,
} from "@/lib/snail-art-types";

/** Per-slot recolor toggles stored in Firestore `adminSettings/snailArtRecolorPolicy`. */
export type SnailArtRecolorPolicy = Record<SnailArtCategory, boolean>;

export const DEFAULT_SNAIL_ART_RECOLOR_POLICY: SnailArtRecolorPolicy = {
  antenna: true,
  body: true,
  shell: true,
  face: false,
  accessory: false,
};

export function parseSnailArtRecolorPolicy(
  raw: Record<string, unknown> | null | undefined,
): SnailArtRecolorPolicy {
  const categories = raw?.categories;
  const out = { ...DEFAULT_SNAIL_ART_RECOLOR_POLICY };
  if (!categories || typeof categories !== "object") return out;

  for (const cat of SNAIL_ART_CATEGORIES) {
    const value = (categories as Record<string, unknown>)[cat];
    if (typeof value === "boolean") {
      out[cat] = value;
    }
  }
  // Faces are never player-tinted in the app.
  out.face = false;
  return out;
}

export function categoryAllowsRecolor(
  policy: SnailArtRecolorPolicy,
  category: SnailArtCategory,
): boolean {
  return policy[category] === true;
}

/** Global slot policy AND per-asset `recolorable` flag. */
export function layerIsRecolorable(
  policy: SnailArtRecolorPolicy,
  layer: { category?: string; recolorable?: boolean },
): boolean {
  const cat = layer.category as SnailArtCategory | undefined;
  if (!cat || !SNAIL_ART_CATEGORIES.includes(cat)) return false;
  if (layer.recolorable === false) return false;
  return categoryAllowsRecolor(policy, cat);
}
