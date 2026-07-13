/**
 * Minimal Lob REST client (letters). Uses HTTP Basic auth with API key as username.
 * @see https://docs.lob.com — POST /v1/letters
 */

import type { Firestore } from "firebase-admin/firestore";

import { sanitizeLobMetadata } from "@/lib/lob-address";
import { resolveLobSecretKey, lobSecretConfigured } from "@/lib/lob-credentials";
import type { LobAddressPlacement, LobMailType, LobReturnAddress } from "@/lib/lob-fulfillment-settings";

const LOB_API_BASE = "https://api.lob.com/v1";
const LOB_REQUEST_TIMEOUT_MS = 90_000;
/** 2024-01-01 returns 403 on some accounts; 2020-02-11 works for US letter create. */
const LOB_API_VERSION = "2020-02-11";

export type LobInlineAddress = {
  name: string;
  address_line1: string;
  address_line2?: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_country?: string;
};

export type LobLetterUseType = "marketing" | "operational";

export type LobLetterCreateParams = {
  description: string;
  to: LobInlineAddress;
  from: LobInlineAddress;
  file: string;
  color: boolean;
  double_sided: boolean;
  mail_type: LobMailType;
  address_placement: LobAddressPlacement;
  size: "us_letter" | "us_legal";
  use_type: LobLetterUseType;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
};

export type LobLetterResponse = {
  id: string;
  url?: string;
  tracking_number?: string | null;
  expected_delivery_date?: string;
  object?: string;
  error?: { message?: string };
};

export type LobApiError = {
  message: string;
  status: number;
  body?: unknown;
};

export async function lobConfigured(
  db: Firestore,
  environment: "test" | "live",
): Promise<boolean> {
  return lobSecretConfigured(db, environment);
}

/** @deprecated Use returnAddressToLobAddress from lob-address.ts */
export function toLobInlineAddress(addr: LobReturnAddress): LobInlineAddress {
  return {
    name: addr.name.trim(),
    address_line1: addr.line1.trim(),
    address_city: addr.city.trim(),
    address_state: addr.state.trim().toUpperCase().slice(0, 2),
    address_zip: addr.zip.trim(),
    address_country: "US",
    ...(addr.line2?.trim() ? { address_line2: addr.line2.trim() } : {}),
  };
}

const LOB_DELIVERABILITY_HINT =
  " Lower US address strictness in Lob (Settings → Account) to Normal or Relaxed, or fix the recipient mailing address.";

function parseLobErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (o.error && typeof o.error === "object") {
      const err = o.error as Record<string, unknown>;
      if (typeof err.message === "string") {
        const msg = err.message;
        if (/deliverability strictness/i.test(msg)) {
          return `${msg}${LOB_DELIVERABILITY_HINT}`;
        }
        return msg;
      }
    }
    if (typeof o.message === "string") {
      const msg = o.message;
      if (/deliverability strictness/i.test(msg)) {
        return `${msg}${LOB_DELIVERABILITY_HINT}`;
      }
      return msg;
    }
  }
  return `Lob API error (${status})`;
}

/** User-facing hint for Lob submit failures saved on print jobs. */
export function formatLobSubmitErrorMessage(message: string): string {
  if (/deliverability strictness/i.test(message) && !message.includes("Lower US address strictness")) {
    return `${message}${LOB_DELIVERABILITY_HINT}`;
  }
  return message;
}

export async function createLobLetter(
  db: Firestore,
  environment: "test" | "live",
  params: LobLetterCreateParams,
): Promise<LobLetterResponse> {
  const key = await resolveLobSecretKey(db, environment);
  if (!key) {
    throw {
      message: `LOB secret API key not configured for ${environment} mode (add in Lob settings or .env.local)`,
      status: 500,
    } satisfies LobApiError;
  }

  const { idempotencyKey, metadata, size: _size, ...rest } = params;
  const payload: Record<string, unknown> = {
    ...rest,
    metadata: metadata ? sanitizeLobMetadata(metadata) : undefined,
  };
  // Omit `size` — only supported on Lob-Version 2024-01-01+ (403 on this account).

  const auth = Buffer.from(`${key}:`, "utf8").toString("base64");
  const headers: Record<string, string> = {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    "Lob-Version": LOB_API_VERSION,
  };
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey.slice(0, 255);
  }

  const res = await fetch(`${LOB_API_BASE}/letters`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(LOB_REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }

  if (!res.ok) {
    throw {
      message: parseLobErrorMessage(body, res.status),
      status: res.status,
      body,
    } satisfies LobApiError;
  }

  return body as LobLetterResponse;
}

export async function getLobLetter(
  db: Firestore,
  environment: "test" | "live",
  letterId: string,
): Promise<Record<string, unknown>> {
  const key = await resolveLobSecretKey(db, environment);
  if (!key) {
    throw {
      message: `LOB secret API key not configured for ${environment} mode`,
      status: 500,
    } satisfies LobApiError;
  }

  const auth = Buffer.from(`${key}:`, "utf8").toString("base64");
  const res = await fetch(`${LOB_API_BASE}/letters/${encodeURIComponent(letterId)}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "Lob-Version": LOB_API_VERSION,
    },
    signal: AbortSignal.timeout(LOB_REQUEST_TIMEOUT_MS),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw {
      message: `Lob GET letter failed (${res.status})`,
      status: res.status,
      body,
    } satisfies LobApiError;
  }

  return body as Record<string, unknown>;
}
