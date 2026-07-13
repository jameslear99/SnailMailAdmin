/**
 * Shared helpers for admin postcard packing / printing.
 */

export function captionFromMailPost(mailPost: Record<string, unknown> | null): string {
  if (!mailPost) return "";
  const body = mailPost.bodyText;
  if (typeof body === "string" && body.trim()) return body.trim();
  const msg = mailPost.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  return "";
}

export function formatIsoShort(iso: string | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/** Human-readable date for printed “Sent on” labels. */
export function formatSentOnDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
