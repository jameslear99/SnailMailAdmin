/**
 * HTML for Lob US-letter jobs.
 *
 * Page 1: thank-you copy beside recipient snail artwork, two posts at the bottom.
 * Page 2+: four posts per page in a 2×2 grid.
 */

import type { EnrichedPrintQueueItem } from "@/lib/enrich-lob-letter-items";
import { formatSentOnDate } from "@/lib/postcard-print-utils";

/** Posts on the cover page (bottom row only). */
export const POSTCARDS_COVER_PAGE = 2;

/** Posts on each subsequent content page (all four quadrants). */
export const POSTCARDS_PER_CONTENT_PAGE = 4;

/** Practical max per Lob letter file (cover + 14 content pages). */
export const POSTCARDS_PER_LOB_LETTER_MAX = POSTCARDS_COVER_PAGE + POSTCARDS_PER_CONTENT_PAGE * 14;

/** @deprecated Use POSTCARDS_PER_LOB_LETTER_MAX — kept for imports. */
export const POSTCARDS_PER_LOB_LETTER_DOUBLE_SIDED = POSTCARDS_PER_LOB_LETTER_MAX;

/** @deprecated Use POSTCARDS_PER_CONTENT_PAGE. */
export const POSTCARDS_PER_LOB_LETTER = POSTCARDS_PER_CONTENT_PAGE;

export function postcardsPerLobLetter(_doubleSided?: boolean): number {
  return POSTCARDS_PER_LOB_LETTER_MAX;
}

const THANK_YOU_MESSAGE =
  "Thank you for supporting Snail Mail! Your belief in slow, thoughtful postcards means more than we can say — your support is greatly appreciated, and we're so glad you're part of this community.";

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

/** Half-sheet column width (8in sheet, two columns). */
const QUAD_COLUMN_WIDTH_IN = 4;

/** Photo + top inset sized so top/left/right spacing match within the quadrant. */
function quadContentStyle(): string {
  const photoIn = 2.5;
  const insetIn = (QUAD_COLUMN_WIDTH_IN - photoIn) / 2;
  return `width:${photoIn}in;margin:${insetIn}in auto 0;`;
}

function quadPhotoStyle(): string {
  return "width:2.5in;height:2.5in;";
}

function renderSnailBadge(item: EnrichedPrintQueueItem): string {
  const snailUrl = item.senderSnailImageUrl?.trim();
  const name = escapeHtml(senderUsernameLabel(item));
  if (snailUrl) {
    return `<img src="${escapeHtml(snailUrl)}" alt="${name}" width="56" height="56" class="quad-snail-img" />`;
  }
  return `<span class="quad-snail-fallback">${SNAIL_PLACEHOLDER_SVG}</span>`;
}

function renderPostCell(item: EnrichedPrintQueueItem | undefined): string {
  if (!item) {
    return `<td class="quad-cell quad-cell--empty">&nbsp;</td>`;
  }

  const caption = escapeHtml(postcardCaption(item));
  const date = escapeHtml(sentDateLabel(item));
  const fromLabel = escapeHtml(senderUsernameLabel(item));
  const imageUrl = postcardImageUrl(item);
  const snail = renderSnailBadge(item);

  const imageBlock = imageUrl
    ? `<img class="quad-photo" style="${quadPhotoStyle()}" src="${escapeHtml(imageUrl)}" alt="" />`
    : `<div class="quad-photo quad-photo--missing" style="${quadPhotoStyle()}">No photo</div>`;

  return `
    <td class="quad-cell">
      <table class="quad-layout" cellpadding="0" cellspacing="0" width="100%" height="100%">
        <tr>
          <td class="quad-main" valign="top">
            <div class="quad-content" style="${quadContentStyle()}">
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

type LetterPage =
  | {
      kind: "cover";
      slots: [
        EnrichedPrintQueueItem | undefined,
        EnrichedPrintQueueItem | undefined,
      ];
    }
  | {
      kind: "grid";
      slots: [
        EnrichedPrintQueueItem | undefined,
        EnrichedPrintQueueItem | undefined,
        EnrichedPrintQueueItem | undefined,
        EnrichedPrintQueueItem | undefined,
      ];
    };

export function paginatePostcardsForLetter(items: EnrichedPrintQueueItem[]): LetterPage[] {
  const pages: LetterPage[] = [];
  if (items.length === 0) return pages;

  pages.push({
    kind: "cover",
    slots: [items[0], items[1]],
  });

  for (let i = POSTCARDS_COVER_PAGE; i < items.length; i += POSTCARDS_PER_CONTENT_PAGE) {
    pages.push({
      kind: "grid",
      slots: [items[i], items[i + 1], items[i + 2], items[i + 3]],
    });
  }

  return pages;
}

function renderCoverIntro(recipientSnailImageUrl?: string): string {
  const snailCell = recipientSnailImageUrl?.trim()
    ? `<td class="cover-intro-snail" valign="middle">
        <img class="cover-snail" src="${escapeHtml(recipientSnailImageUrl.trim())}" alt="" />
      </td>`
    : `<td class="cover-intro-snail cover-intro-snail--empty" valign="middle">&nbsp;</td>`;

  return `
    <table class="cover-intro" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        ${snailCell}
        <td class="cover-intro-thanks" valign="middle">
          <p class="thanks">${escapeHtml(THANK_YOU_MESSAGE)}</p>
        </td>
      </tr>
    </table>
  `;
}

function renderPage(page: LetterPage, recipientSnailImageUrl?: string): string {
  if (page.kind === "cover") {
    const [left, right] = page.slots;
    return `
      <div class="sheet sheet--cover">
        ${renderCoverIntro(recipientSnailImageUrl)}
        <table class="quad-table" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            ${renderPostCell(left)}
            ${renderPostCell(right)}
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
          ${renderPostCell(tl)}
          ${renderPostCell(tr)}
        </tr>
        <tr>
          ${renderPostCell(bl)}
          ${renderPostCell(br)}
        </tr>
      </table>
    </div>
  `;
}

export type BuildLobLetterHtmlOptions = {
  recipientName?: string;
  recipientSnailImageUrl?: string;
  doubleSided?: boolean;
};

/** Build Lob `file` HTML for enriched queue items. */
export function buildLobLetterHtml(
  items: EnrichedPrintQueueItem[],
  options?: BuildLobLetterHtmlOptions | string,
): string {
  const opts: BuildLobLetterHtmlOptions =
    typeof options === "string" ? { recipientName: options } : (options ?? {});
  const packed = items.slice(0, POSTCARDS_PER_LOB_LETTER_MAX);
  const pages = paginatePostcardsForLetter(packed);
  const body = pages.map((p) => renderPage(p, opts.recipientSnailImageUrl)).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: letter; margin: 0.25in; }
    * { box-sizing: border-box; }
    html, body {
      font-family: Georgia, 'Times New Roman', serif;
      color: #2E2A24;
      margin: 0;
      padding: 0;
    }
    .sheet {
      width: 8in;
      margin: 0 auto;
      page-break-inside: avoid;
    }
    .sheet + .sheet { page-break-before: always; }
    .sheet--cover {
      padding-top: 2.65in;
      min-height: 10.2in;
    }
    .cover-intro {
      width: 100%;
      table-layout: fixed;
      margin-bottom: 0.1in;
    }
    .cover-intro-snail {
      width: 38%;
      vertical-align: middle;
      padding: 0.12in 0.1in 0.12in 0.22in;
    }
    .cover-intro-snail--empty {
      width: 0;
      padding: 0;
    }
    .cover-intro-thanks {
      vertical-align: middle;
      padding: 0.14in 0.22in 0.14in 0.08in;
    }
    .thanks {
      margin: 0;
      padding: 0;
      font-size: 10.5pt;
      line-height: 1.45;
      text-align: left;
      color: #2E2A24;
    }
    .cover-snail {
      height: 2.2in;
      width: auto;
      max-width: 2.8in;
      display: block;
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
      margin-left: auto;
      margin-right: auto;
    }
    .quad-photo-wrap {
      padding: 0;
      text-align: center;
      line-height: 0;
    }
    .quad-photo {
      object-fit: cover;
      border-radius: 2px;
      display: block;
      margin: 0 auto;
      background: #E8E4DC;
      max-width: 100%;
    }
    .quad-photo--missing {
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
      font-size: 8.5pt;
      line-height: 1.4;
      max-height: 0.58in;
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
      font-size: 7pt;
      color: #5C564D;
      white-space: nowrap;
      vertical-align: middle;
      padding-left: 0.02in;
    }
    .quad-from {
      margin: 0;
      font-size: 7.5pt;
      color: #5C564D;
      text-align: right;
      font-style: italic;
      vertical-align: middle;
      white-space: nowrap;
      padding-right: 0.02in;
    }
    .quad-snail-img {
      width: 56px;
      height: 56px;
      display: block;
      margin: 0 auto;
      object-fit: contain;
    }
    .quad-snail-fallback {
      display: block;
      width: 56px;
      height: 56px;
      line-height: 0;
      margin: 0 auto;
    }
    .sheet--grid .quad-cell,
    .sheet--cover .quad-cell {
      height: 4.75in;
    }
    .sheet--grid .quad-layout,
    .sheet--cover .quad-layout {
      height: 4.75in;
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
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
