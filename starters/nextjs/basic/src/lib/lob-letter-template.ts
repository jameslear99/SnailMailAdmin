/**
 * Client-safe Lob letter template: layout dimensions, CSS, and sample preview data.
 * Stored in Firestore as `adminSettings/lobFulfillment.letterLayout`.
 */

import { HERO_SNAIL_PX, POSTCARDS_COVER_PAGE } from "@/lib/lob-letter-layout";

export type LobLetterLayoutSettings = {
  /** Top padding on cover front for Lob address window. */
  coverAddressPaddingTopIn: number;
  coverSnailSizeIn: number;
  coverSnailMarginBottomIn: number;
  coverIntroPaddingHorizontalIn: number;
  coverIntroPaddingBottomIn: number;
  thankYouFontSizePt: number;
  thankYouLineHeight: number;
  /** Height of each cover-back postcard row cell. */
  coverBackCellHeightIn: number;
  /** Height of each grid-page postcard cell. */
  gridCellHeightIn: number;
  /** Combined cover page cell height (single-sided mode). */
  coverCombinedCellHeightIn: number;
  quadPhotoSizeIn: number;
  quadCaptionMaxHeightIn: number;
  quadCaptionFontSizePt: number;
  badgeSnailPx: number;
  metaFontSizeSentPt: number;
  metaFontSizeFromPt: number;
  sheetWidthIn: number;
  pageMarginIn: number;
};

export const DEFAULT_LOB_LETTER_LAYOUT: LobLetterLayoutSettings = {
  coverAddressPaddingTopIn: 2.65,
  coverSnailSizeIn: 2.2,
  coverSnailMarginBottomIn: 0.16,
  coverIntroPaddingHorizontalIn: 0.55,
  coverIntroPaddingBottomIn: 0.2,
  thankYouFontSizePt: 10.5,
  thankYouLineHeight: 1.45,
  coverBackCellHeightIn: 5,
  gridCellHeightIn: 4.75,
  coverCombinedCellHeightIn: 4.75,
  quadPhotoSizeIn: 2.5,
  quadCaptionMaxHeightIn: 0.58,
  quadCaptionFontSizePt: 8.5,
  badgeSnailPx: 56,
  metaFontSizeSentPt: 7,
  metaFontSizeFromPt: 7.5,
  sheetWidthIn: 8,
  pageMarginIn: 0.25,
};

function clampNum(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function parseLobLetterLayout(raw: unknown): LobLetterLayoutSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_LOB_LETTER_LAYOUT };
  }
  const o = raw as Record<string, unknown>;
  const d = DEFAULT_LOB_LETTER_LAYOUT;
  return {
    coverAddressPaddingTopIn: clampNum(o.coverAddressPaddingTopIn, d.coverAddressPaddingTopIn, 1.5, 4),
    coverSnailSizeIn: clampNum(o.coverSnailSizeIn, d.coverSnailSizeIn, 1, 3.5),
    coverSnailMarginBottomIn: clampNum(o.coverSnailMarginBottomIn, d.coverSnailMarginBottomIn, 0, 0.5),
    coverIntroPaddingHorizontalIn: clampNum(o.coverIntroPaddingHorizontalIn, d.coverIntroPaddingHorizontalIn, 0, 1.5),
    coverIntroPaddingBottomIn: clampNum(o.coverIntroPaddingBottomIn, d.coverIntroPaddingBottomIn, 0, 0.75),
    thankYouFontSizePt: clampNum(o.thankYouFontSizePt, d.thankYouFontSizePt, 8, 14),
    thankYouLineHeight: clampNum(o.thankYouLineHeight, d.thankYouLineHeight, 1.1, 2),
    coverBackCellHeightIn: clampNum(o.coverBackCellHeightIn, d.coverBackCellHeightIn, 3, 7),
    gridCellHeightIn: clampNum(o.gridCellHeightIn, d.gridCellHeightIn, 3, 7),
    coverCombinedCellHeightIn: clampNum(o.coverCombinedCellHeightIn, d.coverCombinedCellHeightIn, 3, 7),
    quadPhotoSizeIn: clampNum(o.quadPhotoSizeIn, d.quadPhotoSizeIn, 1.5, 3.5),
    quadCaptionMaxHeightIn: clampNum(o.quadCaptionMaxHeightIn, d.quadCaptionMaxHeightIn, 0.2, 1.5),
    quadCaptionFontSizePt: clampNum(o.quadCaptionFontSizePt, d.quadCaptionFontSizePt, 6, 12),
    badgeSnailPx: clampNum(o.badgeSnailPx, d.badgeSnailPx, 32, 96),
    metaFontSizeSentPt: clampNum(o.metaFontSizeSentPt, d.metaFontSizeSentPt, 5, 10),
    metaFontSizeFromPt: clampNum(o.metaFontSizeFromPt, d.metaFontSizeFromPt, 5, 10),
    sheetWidthIn: clampNum(o.sheetWidthIn, d.sheetWidthIn, 7.5, 8.5),
    pageMarginIn: clampNum(o.pageMarginIn, d.pageMarginIn, 0, 0.5),
  };
}

export function validateLobLetterLayout(_layout: LobLetterLayoutSettings): string | null {
  return null;
}

/** PNG render target for cover snail — at least layout size at 300 DPI. */
export function coverSnailRenderPx(layout: LobLetterLayoutSettings): number {
  return Math.max(HERO_SNAIL_PX, Math.round(layout.coverSnailSizeIn * 300));
}

export type LobLetterPostSlot = {
  caption: string;
  sentDateLabel: string;
  senderLabel: string;
  photoUrl?: string;
  senderSnailUrl?: string;
};

export const SAMPLE_LOB_LETTER_POSTS: LobLetterPostSlot[] = [
  {
    caption: "nug lords!!!!!",
    sentDateLabel: "May 20, 2026",
    senderLabel: "@ian",
  },
  {
    caption: "just shot a 78",
    sentDateLabel: "May 25, 2026",
    senderLabel: "@zaddy",
  },
  {
    caption: "just loads of COCKKKKK",
    sentDateLabel: "Jun 26, 2026",
    senderLabel: "@zaddy",
  },
  {
    caption: "cock",
    sentDateLabel: "Jun 29, 2026",
    senderLabel: "@zaddy",
  },
  {
    caption: "hey guys",
    sentDateLabel: "Jul 1, 2026",
    senderLabel: "@zaddy",
  },
  {
    caption: "Cock",
    sentDateLabel: "Jul 1, 2026",
    senderLabel: "@zaddy",
  },
  {
    caption: "shot a 78",
    sentDateLabel: "Jul 2, 2026",
    senderLabel: "@zaddy",
  },
];

/** Minimum sample posts to fill cover + one grid page in the editor. */
export const SAMPLE_LOB_LETTER_POST_COUNT = Math.max(
  SAMPLE_LOB_LETTER_POSTS.length,
  POSTCARDS_COVER_PAGE + 4,
);

export function buildLobLetterStylesheet(
  layout: LobLetterLayoutSettings,
  options?: { previewMode?: boolean },
): string {
  const preview = options?.previewMode ?? false;
  const quadColumnWidthIn = layout.sheetWidthIn / 2;
  const photoInsetIn = (quadColumnWidthIn - layout.quadPhotoSizeIn) / 2;

  return `
    @page { size: letter; margin: ${layout.pageMarginIn}in; }
    * { box-sizing: border-box; }
    html, body {
      font-family: Georgia, 'Times New Roman', serif;
      color: #2E2A24;
      margin: 0;
      padding: 0;
    }
    .sheet {
      width: ${layout.sheetWidthIn}in;
      margin: 0 auto;
      page-break-inside: avoid;
    }
    .sheet + .sheet { page-break-before: always; }
    .sheet--cover {
      padding-top: ${layout.coverAddressPaddingTopIn}in;
    }
    .sheet--cover-front {
      min-height: 10in;
      page-break-after: always;
    }
    .sheet--cover-back .quad-cell,
    .sheet--cover-back .quad-layout {
      height: ${layout.coverBackCellHeightIn}in;
    }
    .cover-intro {
      width: 100%;
      padding: 0 ${layout.coverIntroPaddingHorizontalIn}in ${layout.coverIntroPaddingBottomIn}in;
      box-sizing: border-box;
    }
    .cover-intro-snail-wrap {
      text-align: center;
      margin: 0 0 ${layout.coverSnailMarginBottomIn}in;
      line-height: 0;
    }
    .thanks {
      margin: 0;
      padding: 0 0.12in;
      font-size: ${layout.thankYouFontSizePt}pt;
      line-height: ${layout.thankYouLineHeight};
      text-align: left;
      color: #2E2A24;
    }
    .cover-snail {
      height: ${layout.coverSnailSizeIn}in;
      width: ${layout.coverSnailSizeIn}in;
      max-width: ${layout.coverSnailSizeIn + 0.6}in;
      display: inline-block;
      object-fit: contain;
    }
    .cover-snail--placeholder,
    .quad-photo--placeholder,
    .quad-snail--placeholder {
      background: repeating-linear-gradient(
        -45deg,
        #E8E4DC,
        #E8E4DC 8px,
        #D8D2C8 8px,
        #D8D2C8 16px
      );
      border: 1px dashed #9A9288;
      color: #5C564D;
      font-family: system-ui, sans-serif;
      font-size: 9pt;
      font-style: normal;
      font-weight: 600;
      text-align: center;
    }
    .cover-snail--placeholder {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
      padding: 0.1in;
    }
    .quad-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
    }
    .quad-cell {
      width: 50%;
      vertical-align: top;
      padding: 0;
      border: 1px solid #D0C8BC;
    }
    .quad-cell--empty {
      border: 1px solid #D0C8BC;
    }
    .quad-layout {
      width: 100%;
      height: 100%;
    }
    .quad-main {
      vertical-align: top;
      padding: 0 0 0.06in;
    }
    .quad-content {
      width: ${layout.quadPhotoSizeIn}in;
      margin: ${photoInsetIn}in auto 0;
    }
    .quad-photo-wrap {
      padding: 0;
      text-align: center;
      line-height: 0;
    }
    .quad-photo {
      width: ${layout.quadPhotoSizeIn}in;
      height: ${layout.quadPhotoSizeIn}in;
      object-fit: cover;
      border-radius: 2px;
      display: block;
      margin: 0 auto;
      background: #E8E4DC;
      max-width: 100%;
    }
    .quad-photo--missing,
    .quad-photo--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8pt;
      color: #888;
      font-style: italic;
    }
    .quad-caption {
      margin: 0.08in 0 0;
      padding: 0;
      font-size: ${layout.quadCaptionFontSizePt}pt;
      line-height: 1.4;
      max-height: ${layout.quadCaptionMaxHeightIn}in;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
      text-align: left;
    }
    .quad-caption--empty { visibility: hidden; }
    .quad-foot {
      padding: 0 0 0.1in;
    }
    .quad-foot-snail {
      text-align: center;
      line-height: 0;
    }
    .quad-foot-block {
      width: 58%;
      margin: 0 auto;
    }
    .quad-foot-rule {
      border-top: 1px solid #D8D2C8;
      width: 100%;
      margin: 0.05in 0 0.04in;
      height: 0;
      line-height: 0;
      font-size: 0;
    }
    .quad-meta { width: 100%; }
    .quad-sent {
      font-size: ${layout.metaFontSizeSentPt}pt;
      color: #5C564D;
      white-space: nowrap;
      vertical-align: middle;
      padding-left: 0.02in;
    }
    .quad-from {
      margin: 0;
      font-size: ${layout.metaFontSizeFromPt}pt;
      color: #5C564D;
      text-align: right;
      font-style: italic;
      vertical-align: middle;
      white-space: nowrap;
      padding-right: 0.02in;
    }
    .quad-snail-img {
      width: ${layout.badgeSnailPx}px;
      height: ${layout.badgeSnailPx}px;
      display: block;
      margin: 0 auto;
      object-fit: contain;
    }
    .quad-snail--placeholder {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto;
      font-size: 7pt;
      line-height: 1.1;
      padding: 2px;
    }
    .quad-snail-fallback {
      display: block;
      width: ${layout.badgeSnailPx}px;
      height: ${layout.badgeSnailPx}px;
      line-height: 0;
      margin: 0 auto;
    }
    .sheet--grid .quad-cell,
    .sheet--grid .quad-layout {
      height: ${layout.gridCellHeightIn}in;
    }
    .sheet--cover:not(.sheet--cover-front):not(.sheet--cover-back) .quad-cell,
    .sheet--cover:not(.sheet--cover-front):not(.sheet--cover-back) .quad-layout {
      height: ${layout.coverCombinedCellHeightIn}in;
    }
    ${
      preview
        ? `
    .sheet {
      outline: 1px solid #C8D5B9;
      outline-offset: 2px;
      margin-bottom: 0.35in;
    }
    `
        : ""
    }
  `;
}

export type LobLetterLayoutField = {
  key: keyof LobLetterLayoutSettings;
  label: string;
  step: number;
  min: number;
  max: number;
  unit: "in" | "pt" | "px" | "ratio";
  group: "cover" | "posts" | "typography" | "page";
};

export const LOB_LETTER_LAYOUT_FIELDS: LobLetterLayoutField[] = [
  { key: "coverAddressPaddingTopIn", label: "Cover address clearance", step: 0.05, min: 1.5, max: 4, unit: "in", group: "cover" },
  { key: "coverSnailSizeIn", label: "Recipient snail size", step: 0.05, min: 1, max: 3.5, unit: "in", group: "cover" },
  { key: "coverSnailMarginBottomIn", label: "Snail bottom margin", step: 0.02, min: 0, max: 0.5, unit: "in", group: "cover" },
  { key: "coverIntroPaddingHorizontalIn", label: "Intro side padding", step: 0.05, min: 0, max: 1.5, unit: "in", group: "cover" },
  { key: "coverIntroPaddingBottomIn", label: "Intro bottom padding", step: 0.02, min: 0, max: 0.75, unit: "in", group: "cover" },
  { key: "coverBackCellHeightIn", label: "Cover-back row height", step: 0.05, min: 3, max: 7, unit: "in", group: "cover" },
  { key: "coverCombinedCellHeightIn", label: "Single-sided cover row height", step: 0.05, min: 3, max: 7, unit: "in", group: "cover" },
  { key: "quadPhotoSizeIn", label: "Postcard photo size", step: 0.05, min: 1.5, max: 3.5, unit: "in", group: "posts" },
  { key: "gridCellHeightIn", label: "Grid cell height", step: 0.05, min: 3, max: 7, unit: "in", group: "posts" },
  { key: "quadCaptionMaxHeightIn", label: "Caption max height", step: 0.02, min: 0.2, max: 1.5, unit: "in", group: "posts" },
  { key: "badgeSnailPx", label: "Sender snail badge", step: 2, min: 32, max: 96, unit: "px", group: "posts" },
  { key: "thankYouFontSizePt", label: "Thank-you font size", step: 0.5, min: 8, max: 14, unit: "pt", group: "typography" },
  { key: "thankYouLineHeight", label: "Thank-you line height", step: 0.05, min: 1.1, max: 2, unit: "ratio", group: "typography" },
  { key: "quadCaptionFontSizePt", label: "Caption font size", step: 0.5, min: 6, max: 12, unit: "pt", group: "typography" },
  { key: "metaFontSizeSentPt", label: "Sent date font size", step: 0.5, min: 5, max: 10, unit: "pt", group: "typography" },
  { key: "metaFontSizeFromPt", label: "Sender label font size", step: 0.5, min: 5, max: 10, unit: "pt", group: "typography" },
  { key: "sheetWidthIn", label: "Sheet content width", step: 0.05, min: 7.5, max: 8.5, unit: "in", group: "page" },
  { key: "pageMarginIn", label: "Page margin", step: 0.05, min: 0, max: 0.5, unit: "in", group: "page" },
];
