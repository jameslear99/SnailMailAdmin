import "server-only";

/**
 * HTML for Lob US-letter jobs.
 *
 * Single-sided: page 1 = intro + two posts; page 2+ = 4-up grid.
 * Double-sided: page 1 = intro (address window); page 2 = two cover posts (sheet 1 back);
 * page 3+ = 4-up grids on subsequent sheets.
 */

import type { EnrichedPrintQueueItem } from "@/lib/enrich-lob-letter-items";
import { DEFAULT_LOB_THANK_YOU_MESSAGE } from "@/lib/lob-letter-format";
import {
  POSTCARDS_COVER_PAGE,
  POSTCARDS_PER_CONTENT_PAGE,
  POSTCARDS_PER_LOB_LETTER_MAX,
} from "@/lib/lob-letter-layout";
import {
  buildLobLetterStylesheet,
  coverSnailRenderPx,
  DEFAULT_LOB_LETTER_LAYOUT,
  type LobLetterLayoutSettings,
  type LobLetterPostSlot,
} from "@/lib/lob-letter-template";
import { formatSentOnDate } from "@/lib/postcard-print-utils";

export {
  POSTCARDS_COVER_PAGE,
  POSTCARDS_PER_CONTENT_PAGE,
  POSTCARDS_PER_LOB_LETTER_MAX,
} from "@/lib/lob-letter-layout";

/** @deprecated Use POSTCARDS_PER_LOB_LETTER_MAX — kept for imports. */
export const POSTCARDS_PER_LOB_LETTER_DOUBLE_SIDED = POSTCARDS_PER_LOB_LETTER_MAX;

/** @deprecated Use POSTCARDS_PER_CONTENT_PAGE. */
export const POSTCARDS_PER_LOB_LETTER = POSTCARDS_PER_CONTENT_PAGE;

export function postcardsPerLobLetter(_doubleSided?: boolean): number {
  return POSTCARDS_PER_LOB_LETTER_MAX;
}

/** @deprecated Import from `@/lib/lob-letter-format` — kept for existing imports. */
export const THANK_YOU_MESSAGE = DEFAULT_LOB_THANK_YOU_MESSAGE;

const SNAIL_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="56" height="56" aria-hidden="true"><ellipse cx="16" cy="20" rx="11" ry="8" fill="#8B9E7A"/><circle cx="16" cy="12" r="6" fill="#6E8B5E"/><circle cx="14" cy="11" r="1.2" fill="#2E2A24"/><path d="M20 10c2 1 3 3 3 5" stroke="#5C564D" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function postcardCaption(item: EnrichedPrintQueueItem): string {
  const post = item.mailPost;
  if (!post) return "";
  const body = typeof post.bodyText === "string" ? post.bodyText.trim() : "";
  if (body) return body;
  const snap = typeof post.recipientSnapshotBodyText === "string" ? post.recipientSnapshotBodyText : "";
  return snap.trim();
}

function postcardImageUrl(item: EnrichedPrintQueueItem): string | null {
  const post = item.mailPost;
  if (!post) return null;
  const url = post.renderedFrontImageUrl;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function senderUsernameLabel(item: EnrichedPrintQueueItem): string {
  const username = item.senderUsername?.trim();
  if (username) return username.startsWith("@") ? username : `@${username}`;
  const post = item.mailPost;
  const snailName = post && typeof post.senderSnailName === "string" ? post.senderSnailName.trim() : "";
  if (snailName) return snailName;
  return "A friend";
}

function sentDateLabel(item: EnrichedPrintQueueItem): string {
  const post = item.mailPost;
  const sent = post && typeof post.sentAt === "string" ? post.sentAt : item.createdAt;
  return formatSentOnDate(sent);
}

export function enrichedItemToPostSlot(item: EnrichedPrintQueueItem): LobLetterPostSlot {
  return {
    caption: postcardCaption(item),
    sentDateLabel: sentDateLabel(item),
    senderLabel: senderUsernameLabel(item),
    photoUrl: postcardImageUrl(item) ?? undefined,
    senderSnailUrl: item.senderSnailImageUrl?.trim() || undefined,
  };
}

export function enrichedItemsToPostSlots(items: EnrichedPrintQueueItem[]): LobLetterPostSlot[] {
  return items.map(enrichedItemToPostSlot);
}

type LetterPage =
  | {
      kind: "cover";
      slots: [LobLetterPostSlot | undefined, LobLetterPostSlot | undefined];
    }
  | {
      kind: "cover-front";
    }
  | {
      kind: "cover-back";
      slots: [LobLetterPostSlot | undefined, LobLetterPostSlot | undefined];
    }
  | {
      kind: "grid";
      slots: [
        LobLetterPostSlot | undefined,
        LobLetterPostSlot | undefined,
        LobLetterPostSlot | undefined,
        LobLetterPostSlot | undefined,
      ];
    };

export function paginatePostcardsForLetter(
  items: LobLetterPostSlot[],
  doubleSided = false,
): LetterPage[] {
  const pages: LetterPage[] = [];
  if (items.length === 0) return pages;

  if (doubleSided) {
    pages.push({ kind: "cover-front" });
    pages.push({
      kind: "cover-back",
      slots: [items[0], items[1]],
    });
  } else {
    pages.push({
      kind: "cover",
      slots: [items[0], items[1]],
    });
  }

  for (let i = POSTCARDS_COVER_PAGE; i < items.length; i += POSTCARDS_PER_CONTENT_PAGE) {
    const slots: [
      LobLetterPostSlot | undefined,
      LobLetterPostSlot | undefined,
      LobLetterPostSlot | undefined,
      LobLetterPostSlot | undefined,
    ] = [items[i], items[i + 1], items[i + 2], items[i + 3]];
    if (slots.every((slot) => !slot)) continue;
    pages.push({ kind: "grid", slots });
  }

  return pages;
}

/** HTML sheet count for a letter batch (used for Lob print options). */
export function lobLetterSheetCount(items: LobLetterPostSlot[], doubleSided = false): number {
  return paginatePostcardsForLetter(items.slice(0, POSTCARDS_PER_LOB_LETTER_MAX), doubleSided).length;
}

function renderCoverSnail(
  recipientSnailImageUrl: string | undefined,
  layout: LobLetterLayoutSettings,
  previewMode: boolean,
  showRecipientSnail: boolean,
): string {
  if (!showRecipientSnail) return "";

  const renderPx = coverSnailRenderPx(layout);

  if (recipientSnailImageUrl?.trim()) {
    return `<div class="cover-intro-snail-wrap">
        <img class="cover-snail" src="${escapeHtml(recipientSnailImageUrl.trim())}" alt="" width="${renderPx}" height="${renderPx}" />
      </div>`;
  }

  if (previewMode) {
    return `<div class="cover-intro-snail-wrap">
        <div class="cover-snail cover-snail--placeholder" style="width:${layout.coverSnailSizeIn}in;height:${layout.coverSnailSizeIn}in;">Recipient snail</div>
      </div>`;
  }

  return `<div class="cover-intro-snail-wrap">
      <div class="cover-snail cover-snail--placeholder" style="width:${layout.coverSnailSizeIn}in;height:${layout.coverSnailSizeIn}in;">Snail unavailable</div>
    </div>`;
}

function renderCoverIntro(
  recipientSnailImageUrl: string | undefined,
  thankYouMessage: string,
  layout: LobLetterLayoutSettings,
  previewMode: boolean,
  showRecipientSnail: boolean,
): string {
  const snailBlock = renderCoverSnail(recipientSnailImageUrl, layout, previewMode, showRecipientSnail);

  return `
    <div class="cover-intro">
      ${snailBlock}
      <p class="thanks">${escapeHtml(thankYouMessage)}</p>
    </div>
  `;
}

function renderSnailBadge(
  slot: LobLetterPostSlot,
  layout: LobLetterLayoutSettings,
  previewMode: boolean,
): string {
  const name = escapeHtml(slot.senderLabel);
  const px = layout.badgeSnailPx;

  if (previewMode) {
    return `<div class="quad-snail--placeholder" style="width:${px}px;height:${px}px;">Snail</div>`;
  }

  const snailUrl = slot.senderSnailUrl?.trim();
  if (snailUrl) {
    return `<img src="${escapeHtml(snailUrl)}" alt="${name}" width="${px}" height="${px}" class="quad-snail-img" />`;
  }

  return `<span class="quad-snail-fallback">${SNAIL_PLACEHOLDER_SVG}</span>`;
}

function renderPostCell(
  slot: LobLetterPostSlot | undefined,
  layout: LobLetterLayoutSettings,
  previewMode: boolean,
): string {
  if (!slot) {
    return `<td class="quad-cell quad-cell--empty">&nbsp;</td>`;
  }

  const caption = escapeHtml(slot.caption);
  const date = escapeHtml(slot.sentDateLabel);
  const fromLabel = escapeHtml(slot.senderLabel);
  const snail = renderSnailBadge(slot, layout, previewMode);

  let imageBlock: string;
  if (previewMode) {
    imageBlock = `<div class="quad-photo quad-photo--placeholder">Photo</div>`;
  } else if (slot.photoUrl?.trim()) {
    imageBlock = `<img class="quad-photo" src="${escapeHtml(slot.photoUrl.trim())}" alt="" />`;
  } else {
    imageBlock = `<div class="quad-photo quad-photo--missing">No photo</div>`;
  }

  return `
    <td class="quad-cell">
      <table class="quad-layout" cellpadding="0" cellspacing="0" width="100%" height="100%">
        <tr>
          <td class="quad-main" valign="top">
            <div class="quad-content">
              <div class="quad-photo-wrap">${imageBlock}</div>
              ${caption ? `<p class="quad-caption">${caption}</p>` : `<p class="quad-caption quad-caption--empty">&nbsp;</p>`}
            </div>
          </td>
        </tr>
        <tr>
          <td class="quad-foot" valign="bottom">
            <div class="quad-foot-snail">${snail}</div>
            <div class="quad-foot-block">
              <div class="quad-foot-rule"></div>
              <table class="quad-meta" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="quad-sent">${date ? `Sent on ${date}` : ""}</td>
                  <td class="quad-from" align="right">${fromLabel}</td>
                </tr>
              </table>
            </div>
          </td>
        </tr>
      </table>
    </td>
  `;
}

type RenderPageOptions = {
  recipientSnailImageUrl?: string;
  thankYouMessage: string;
  showRecipientSnail: boolean;
  layout: LobLetterLayoutSettings;
  previewMode: boolean;
};

function renderPage(page: LetterPage, pageOpts: RenderPageOptions): string {
  const cell = (slot: LobLetterPostSlot | undefined) =>
    renderPostCell(slot, pageOpts.layout, pageOpts.previewMode);

  if (page.kind === "cover-front") {
    return `
      <div class="sheet sheet--cover sheet--cover-front">
        ${renderCoverIntro(
          pageOpts.recipientSnailImageUrl,
          pageOpts.thankYouMessage,
          pageOpts.layout,
          pageOpts.previewMode,
          pageOpts.showRecipientSnail,
        )}
      </div>
    `;
  }

  if (page.kind === "cover-back") {
    const [left, right] = page.slots;
    return `
      <div class="sheet sheet--cover sheet--cover-back">
        <table class="quad-table" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            ${cell(left)}
            ${cell(right)}
          </tr>
        </table>
      </div>
    `;
  }

  if (page.kind === "cover") {
    const [left, right] = page.slots;
    return `
      <div class="sheet sheet--cover">
        ${renderCoverIntro(
          pageOpts.recipientSnailImageUrl,
          pageOpts.thankYouMessage,
          pageOpts.layout,
          pageOpts.previewMode,
          pageOpts.showRecipientSnail,
        )}
        <table class="quad-table" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            ${cell(left)}
            ${cell(right)}
          </tr>
        </table>
      </div>
    `;
  }

  const [tl, tr, bl, br] = page.slots;
  return `
    <div class="sheet sheet--grid">
      <table class="quad-table" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          ${cell(tl)}
          ${cell(tr)}
        </tr>
        <tr>
          ${cell(bl)}
          ${cell(br)}
        </tr>
      </table>
    </div>
  `;
}

export type BuildLobLetterHtmlOptions = {
  recipientName?: string;
  recipientSnailImageUrl?: string;
  thankYouMessage?: string;
  showRecipientSnailOnCover?: boolean;
  doubleSided?: boolean;
  layout?: LobLetterLayoutSettings;
  previewMode?: boolean;
};

/** Build Lob `file` HTML from post slots (real or sample). */
export function buildLobLetterHtmlFromSlots(
  slots: LobLetterPostSlot[],
  options?: BuildLobLetterHtmlOptions,
): string {
  const opts = options ?? {};
  const thankYouMessage = opts.thankYouMessage?.trim() || DEFAULT_LOB_THANK_YOU_MESSAGE;
  const doubleSided = opts.doubleSided ?? false;
  const layout = opts.layout ?? DEFAULT_LOB_LETTER_LAYOUT;
  const previewMode = opts.previewMode ?? false;
  const showRecipientSnail = opts.showRecipientSnailOnCover !== false;
  const packed = slots.slice(0, POSTCARDS_PER_LOB_LETTER_MAX);
  const pages = paginatePostcardsForLetter(packed, doubleSided);
  const pageOpts: RenderPageOptions = {
    recipientSnailImageUrl: opts.recipientSnailImageUrl,
    thankYouMessage,
    showRecipientSnail,
    layout,
    previewMode,
  };
  const body = pages.map((p) => renderPage(p, pageOpts)).join("\n");
  const css = buildLobLetterStylesheet(layout, { previewMode });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>${css}</style>
</head>
<body>
  ${body}
</body>
</html>`;
}

/** Build Lob `file` HTML for enriched queue items. */
export function buildLobLetterHtml(
  items: EnrichedPrintQueueItem[],
  options?: BuildLobLetterHtmlOptions | string,
): string {
  const opts: BuildLobLetterHtmlOptions =
    typeof options === "string" ? { recipientName: options } : (options ?? {});

  return buildLobLetterHtmlFromSlots(enrichedItemsToPostSlots(items), opts);
}

/** Split queue items into Lob letter batches. */
export function chunkPostcardsForLobLetters(
  items: EnrichedPrintQueueItem[],
  _doubleSided = true,
): EnrichedPrintQueueItem[][] {
  const size = POSTCARDS_PER_LOB_LETTER_MAX;
  const chunks: EnrichedPrintQueueItem[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
