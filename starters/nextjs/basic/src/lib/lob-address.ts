/**
 * Resolve Firestore user docs into Lob-compatible US mailing addresses.
 */

import type { LobInlineAddress } from "@/lib/lob-client";
import type { LobReturnAddress } from "@/lib/lob-fulfillment-settings";

const US_STATE_ABBREV: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

function trimStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}

/** Pull raw address map from user doc (same keys as mailing-address.ts). */
export function extractMailingAddressRecord(
  user: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!user) return null;

  const directKeys = ["address", "mailingAddress", "privateAddress", "shippingAddress"] as const;
  for (const k of directKeys) {
    const v = user[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
  }

  const profile = user.profile;
  if (profile && typeof profile === "object" && !Array.isArray(profile)) {
    const o = profile as Record<string, unknown>;
    for (const k of ["address", "mailingAddress"] as const) {
      const v = o[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return v as Record<string, unknown>;
      }
    }
  }

  return null;
}

export function resolveRecipientDisplayName(
  user: Record<string, unknown> | null | undefined,
  addressRecord?: Record<string, unknown> | null,
): string {
  const fromAddr = addressRecord ? trimStr(addressRecord.name) : "";
  if (fromAddr) return fromAddr;

  if (!user) return "Recipient";

  for (const key of ["displayName", "name", "fullName"] as const) {
    const v = trimStr(user[key]);
    if (v) return v;
  }

  const username = trimStr(user.username);
  if (username) return username;

  return "Recipient";
}

function normalizeUsState(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.length === 2) return t.toUpperCase();
  const mapped = US_STATE_ABBREV[t.toLowerCase()];
  return mapped ?? t.toUpperCase().slice(0, 2);
}

function normalizeZip(raw: string): string {
  const digits = raw.replace(/[^\d-]/g, "");
  const m = digits.match(/^(\d{5})(?:-?(\d{4}))?/);
  if (!m) return raw.trim();
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

function normalizeCountry(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t || t === "US" || t === "USA" || t === "UNITED STATES") return "US";
  return raw.trim();
}

export type LobAddressBuildResult =
  | { ok: true; address: LobInlineAddress }
  | { ok: false; error: string; missing: string[] };

function buildLobInlineFromParts(parts: {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}): LobAddressBuildResult {
  const missing: string[] = [];
  const name = parts.name.trim();
  const line1 = parts.line1.trim();
  const city = parts.city.trim();
  const state = normalizeUsState(parts.state);
  const zip = normalizeZip(parts.zip);
  const country = normalizeCountry(parts.country || "US");

  if (!name) missing.push("name");
  if (!line1) missing.push("line1");
  if (!city) missing.push("city");
  if (!state || state.length !== 2) missing.push("state");
  if (!zip) missing.push("zip");

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Mailing address incomplete (missing: ${missing.join(", ")})`,
      missing,
    };
  }

  if (country !== "US") {
    return { ok: false, error: "Only US addresses are supported for Lob letters", missing: ["country"] };
  }

  const out: LobInlineAddress = {
    name,
    address_line1: line1,
    address_city: city,
    address_state: state,
    address_zip: zip,
    address_country: "US",
  };
  const line2 = parts.line2?.trim();
  if (line2) out.address_line2 = line2;
  return { ok: true, address: out };
}

/** Build Lob `to` address from a user doc. */
export function userDocToLobAddress(
  user: Record<string, unknown> | null | undefined,
): LobAddressBuildResult {
  const addr = extractMailingAddressRecord(user);
  if (!addr) {
    return { ok: false, error: "No mailing address on user profile", missing: ["address"] };
  }

  const name = trimStr(addr.name) || resolveRecipientDisplayName(user, addr);
  const line1 =
    trimStr(addr.line1) || trimStr(addr.street) || trimStr(addr.addressLine1);
  const line2 = trimStr(addr.line2) || trimStr(addr.addressLine2) || undefined;
  const city = trimStr(addr.city) || trimStr(addr.locality);
  const state = trimStr(addr.state) || trimStr(addr.region);
  const zip = trimStr(addr.zip) || trimStr(addr.postalCode);
  const country = trimStr(addr.country) || "US";

  return buildLobInlineFromParts({ name, line1, line2, city, state, zip, country });
}

export function returnAddressToLobAddress(addr: LobReturnAddress): LobAddressBuildResult {
  return buildLobInlineFromParts({
    name: addr.name,
    line1: addr.line1,
    line2: addr.line2,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country || "US",
  });
}

/** Lob metadata values must not contain " or \\ */
export function sanitizeLobMetadata(input: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;
  for (const [k, v] of Object.entries(input)) {
    if (count >= 20) break;
    const key = k.replace(/["\\]/g, "").slice(0, 40);
    const val = v.replace(/["\\]/g, "").slice(0, 500);
    if (key && val) {
      out[key] = val;
      count++;
    }
  }
  return out;
}
