/**
 * Format a Firestore `users.address` map (or legacy shapes) for shipping labels.
 */

function trimStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export function mailingAddressLines(addr: unknown): string[] {
  if (addr == null) return [];
  if (typeof addr === "string") {
    const t = addr.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t) as unknown;
      if (j && typeof j === "object") return mailingAddressLines(j);
    } catch {
      /* plain text */
    }
    return [t];
  }
  if (typeof addr !== "object") return [];

  const o = addr as Record<string, unknown>;
  const name = trimStr(o.name);
  const line1 = trimStr(o.line1) || trimStr(o.street) || trimStr(o.addressLine1);
  const line2 = trimStr(o.line2) || trimStr(o.addressLine2);
  const city = trimStr(o.city) || trimStr(o.locality);
  const state = trimStr(o.state) || trimStr(o.region);
  const zip = trimStr(o.zip) || trimStr(o.postalCode);
  const country = trimStr(o.country);
  const cityLine = [city, state, zip].filter((s) => s.length > 0).join(", ");
  return [name, line1, line2, cityLine, country].filter((s) => s.length > 0);
}

/**
 * Resolve `users/{uid}` private doc shape: try `address` then common alternates / nesting.
 */
export function mailingAddressLinesFromUserDoc(user: Record<string, unknown> | null | undefined): string[] {
  if (!user) return [];
  const directKeys = ["address", "mailingAddress", "privateAddress", "shippingAddress"] as const;
  for (const k of directKeys) {
    const lines = mailingAddressLines(user[k]);
    if (lines.length > 0) return lines;
  }
  const profile = user.profile;
  if (profile && typeof profile === "object" && !Array.isArray(profile)) {
    const o = profile as Record<string, unknown>;
    const nested = mailingAddressLines(o.address ?? o.mailingAddress);
    if (nested.length > 0) return nested;
  }
  return [];
}
