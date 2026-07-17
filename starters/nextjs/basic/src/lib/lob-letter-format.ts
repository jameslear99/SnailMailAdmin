/** Cover-page copy and layout for Lob letter HTML (`build-lob-letter-html.ts`). */

export const DEFAULT_LOB_THANK_YOU_MESSAGE =
  "Thank you for supporting Snail Mail! Your belief in slow, thoughtful postcards means more than we can say — your support is greatly appreciated, and we're so glad you're part of this community.";

export type LobLetterFormatSettings = {
  /** Paragraph under the recipient snail on page 1. */
  thankYouMessage: string;
  /** When false, cover shows thank-you copy only (no recipient snail image). */
  showRecipientSnailOnCover: boolean;
};

export const DEFAULT_LOB_LETTER_FORMAT: LobLetterFormatSettings = {
  thankYouMessage: DEFAULT_LOB_THANK_YOU_MESSAGE,
  showRecipientSnailOnCover: true,
};

export function parseLobLetterFormat(raw: unknown): LobLetterFormatSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_LOB_LETTER_FORMAT };
  }
  const o = raw as Record<string, unknown>;
  const thankYouMessage =
    typeof o.thankYouMessage === "string" && o.thankYouMessage.trim()
      ? o.thankYouMessage.trim()
      : DEFAULT_LOB_THANK_YOU_MESSAGE;
  return {
    thankYouMessage,
    showRecipientSnailOnCover: o.showRecipientSnailOnCover !== false,
  };
}

export function validateLobLetterFormat(format: LobLetterFormatSettings): string | null {
  const msg = format.thankYouMessage.trim();
  if (!msg) return "Cover thank-you message cannot be empty";
  if (msg.length > 2000) return "Cover thank-you message must be 2000 characters or fewer";
  return null;
}
