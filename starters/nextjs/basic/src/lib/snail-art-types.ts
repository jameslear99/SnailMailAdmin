/**
 * Snail layer slots — paint order is by `stackOrder` (lower = further back).
 * Canonical back → front: antenna, body, shell, face, accessory.
 */
export const SNAIL_ART_CATEGORIES = [
  "antenna",
  "body",
  "shell",
  "face",
  "accessory",
] as const;

export type SnailArtCategory = (typeof SNAIL_ART_CATEGORIES)[number];

export function isSnailArtCategory(s: string): s is SnailArtCategory {
  return (SNAIL_ART_CATEGORIES as readonly string[]).includes(s);
}

/** Default stack order per category (lower = drawn first / in back). */
export const DEFAULT_STACK_ORDER: Record<SnailArtCategory, number> = {
  antenna: 10,
  body: 20,
  shell: 30,
  face: 40,
  accessory: 50,
};

/** Top → bottom when compositing a full snail. */
export const SNAIL_ART_PAINT_ORDER_TOP_TO_BOTTOM: readonly SnailArtCategory[] = [
  "accessory",
  "face",
  "shell",
  "body",
  "antenna",
];

type StackableLayer = { category?: string; stackOrder?: unknown };

/** Sort layers for preview / Flutter compositing (category order, then per-asset stackOrder). */
export function compareSnailArtPaintOrder(a: StackableLayer, b: StackableLayer): number {
  const catA = a.category;
  const catB = b.category;
  const baseA =
    catA && isSnailArtCategory(catA) ? DEFAULT_STACK_ORDER[catA] : Number(a.stackOrder) || 0;
  const baseB =
    catB && isSnailArtCategory(catB) ? DEFAULT_STACK_ORDER[catB] : Number(b.stackOrder) || 0;
  if (baseA !== baseB) return baseA - baseB;
  return (Number(a.stackOrder) || 0) - (Number(b.stackOrder) || 0);
}

/** Stored in Firestore collection `snailArtAssets`. */
export type SnailArtAsset = {
  id: string;
  category: SnailArtCategory;
  slug: string;
  displayName: string;
  description?: string;
  storagePath: string;
  storageUrl: string;
  stackOrder: number;
  fileFormat: "svg" | "png" | "webp" | "other";
  /** Pixel dimensions of the source file (expected 1500×1500). */
  widthPx?: number;
  heightPx?: number;
  recolorable: boolean;
  status: "draft" | "published";
};
