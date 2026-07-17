/** Client-safe Lob letter layout constants (no Firebase / Node imports). */

export type SnailPreviewSize = "badge" | "hero";

/** Small sender badge under each postcard quadrant. */
export const BADGE_SNAIL_PX = 256;

/** Cover snail render target (~2.2in at 300 DPI). */
export const HERO_SNAIL_PX = 672;

/** Posts on the cover page (bottom row only). */
export const POSTCARDS_COVER_PAGE = 2;

/** Posts on each subsequent content page (all four quadrants). */
export const POSTCARDS_PER_CONTENT_PAGE = 4;

/** Practical max per Lob letter file (cover + 14 content pages). */
export const POSTCARDS_PER_LOB_LETTER_MAX = POSTCARDS_COVER_PAGE + POSTCARDS_PER_CONTENT_PAGE * 14;
