/**
 * Lob print & mail configuration.
 * Stored in Firestore under `adminSettings/lobFulfillment`.
 */

import {
  DEFAULT_LOB_LETTER_FORMAT,
  parseLobLetterFormat,
  type LobLetterFormatSettings,
  validateLobLetterFormat,
} from "@/lib/lob-letter-format";

export type { LobLetterFormatSettings } from "@/lib/lob-letter-format";
export { DEFAULT_LOB_THANK_YOU_MESSAGE } from "@/lib/lob-letter-format";

export type LobProductType = "letter_us" | "letter_us_legal" | "postcard_4x6";

export type LobAutoSendMode = "disabled" | "immediate" | "scheduled_batch";

/** How often scheduled auto-send actually submits mail. */
export type LobAutoSendFrequency = "daily" | "weekly" | "monthly";

/** Cloud Function timezone — auto-send checks weekday/date in this zone. */
export const AUTO_SEND_TIMEZONE = "America/Denver";

/** JS weekday: 0 = Sunday, 1 = Monday. Weekly mode only submits on this day. */
export const WEEKLY_AUTO_SEND_WEEKDAY = 1;

/** Calendar day of month. Monthly mode only submits on this day. */
export const MONTHLY_AUTO_SEND_DAY = 1;

/** Default interval between automatic Lob send runs (24 hours). */
export const DAILY_AUTO_SEND_INTERVAL_MINUTES = 24 * 60;

/** Interval stored for weekly auto-send (7 days). */
export const WEEKLY_AUTO_SEND_INTERVAL_MINUTES = 7 * 24 * 60;

/** Interval stored for monthly auto-send (30 days, Firestore backward compat). */
export const MONTHLY_AUTO_SEND_INTERVAL_MINUTES = 30 * 24 * 60;

export const AUTO_SEND_FREQUENCY_TITLES: Record<LobAutoSendFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const AUTO_SEND_FREQUENCY_LABELS: Record<LobAutoSendFrequency, string> = {
  daily: "Every day at 9:00 AM Mountain Time",
  weekly: "Every Monday at 9:00 AM Mountain Time",
  monthly: "The 1st of every month at 9:00 AM Mountain Time",
};

export function intervalMinutesForFrequency(frequency: LobAutoSendFrequency): number {
  if (frequency === "monthly") return MONTHLY_AUTO_SEND_INTERVAL_MINUTES;
  if (frequency === "weekly") return WEEKLY_AUTO_SEND_INTERVAL_MINUTES;
  return DAILY_AUTO_SEND_INTERVAL_MINUTES;
}

export function calendarDateInTimeZone(date: Date, timeZone = AUTO_SEND_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** JS weekday (0 = Sunday) in the given IANA timezone. */
export function weekdayInTimeZone(date: Date, timeZone = AUTO_SEND_TIMEZONE): number {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[day] ?? date.getUTCDay();
}

/** Calendar day of month (1–31) in the given IANA timezone. */
export function dayOfMonthInTimeZone(date: Date, timeZone = AUTO_SEND_TIMEZONE): number {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    day: "numeric",
  }).format(date);
  const parsed = parseInt(day, 10);
  return Number.isFinite(parsed) ? parsed : date.getUTCDate();
}

export function parseAutoSendFrequency(raw: unknown): LobAutoSendFrequency {
  if (raw === "daily" || raw === "monthly") return raw;
  return "weekly";
}

export type LobMailType = "usps_first_class" | "usps_standard";

export type LobAddressPlacement = "top_first_page" | "insert_blank_page";

export type LobReturnAddress = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type LobFulfillmentSettings = {
  /** When false, ops use in-house browser printing (legacy flow). */
  lobEnabled: boolean;
  lobEnvironment: "test" | "live";
  productType: LobProductType;
  autoSendMode: LobAutoSendMode;
  /** Daily at 9am MT, weekly on Monday at 9am MT, or monthly on the 1st at 9am MT. */
  autoSendFrequency: LobAutoSendFrequency;
  /** Derived from autoSendFrequency; kept for Firestore backward compatibility. */
  batchIntervalMinutes: number;
  /** Min awaiting-print postcards per recipient before auto-send includes them (manual submit ignores this). */
  batchMinQueuedCards: number;
  /** @deprecated Ignored — auto-send is per-recipient only. Kept for Firestore backward compatibility. */
  batchMinRecipients: number;
  /** Cap recipients submitted per auto run. */
  batchMaxRecipientsPerRun: number;
  /** Parallel Lob submissions per processor run (rate-limit aware). */
  submitConcurrency: number;
  color: boolean;
  doubleSided: boolean;
  mailType: LobMailType;
  addressPlacement: LobAddressPlacement;
  returnAddress: LobReturnAddress;
  /** Cover page thank-you copy and recipient snail display. */
  letterFormat: LobLetterFormatSettings;
};

export const DEFAULT_LOB_RETURN_ADDRESS: LobReturnAddress = {
  name: "Snail Mail",
  line1: "",
  line2: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

export const DEFAULT_LOB_FULFILLMENT_SETTINGS: LobFulfillmentSettings = {
  lobEnabled: false,
  lobEnvironment: "test",
  productType: "letter_us",
  autoSendMode: "disabled",
  autoSendFrequency: "weekly",
  batchIntervalMinutes: WEEKLY_AUTO_SEND_INTERVAL_MINUTES,
  /** One full US letter: 2 postcards on cover + 3×4 inside (see build-lob-letter-html). */
  batchMinQueuedCards: 14,
  batchMinRecipients: 0,
  batchMaxRecipientsPerRun: 25,
  submitConcurrency: 3,
  color: true,
  doubleSided: true,
  mailType: "usps_first_class",
  addressPlacement: "top_first_page",
  returnAddress: { ...DEFAULT_LOB_RETURN_ADDRESS },
  letterFormat: { ...DEFAULT_LOB_LETTER_FORMAT },
};

export const LOB_PRODUCT_LABELS: Record<LobProductType, string> = {
  letter_us: "US Letter (8.5×11)",
  letter_us_legal: "US Legal (8.5×14)",
  postcard_4x6: "Postcard (4×6)",
};

export type ReturnAddressRequiredField = "name" | "line1" | "city" | "state" | "zip";

const RETURN_ADDRESS_FIELD_LABELS: Record<ReturnAddressRequiredField, string> = {
  name: "Name / company",
  line1: "Address line 1",
  city: "City",
  state: "State",
  zip: "ZIP",
};

export function missingReturnAddressFields(addr: LobReturnAddress): ReturnAddressRequiredField[] {
  const missing: ReturnAddressRequiredField[] = [];
  if (!addr.name.trim()) missing.push("name");
  if (!addr.line1.trim()) missing.push("line1");
  if (!addr.city.trim()) missing.push("city");
  if (!addr.state.trim()) missing.push("state");
  if (!addr.zip.trim()) missing.push("zip");
  return missing;
}

export function returnAddressValidationMessage(settings: LobFulfillmentSettings): string | null {
  if (!settings.lobEnabled) return null;
  const missing = missingReturnAddressFields(settings.returnAddress);
  if (missing.length === 0) return null;
  const labels = missing.map((k) => RETURN_ADDRESS_FIELD_LABELS[k]);
  return `Return address is required when Lob is enabled. Please fill in: ${labels.join(", ")}.`;
}

function trimStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  return "";
}

function parseReturnAddress(raw: unknown): LobReturnAddress {
  const base = { ...DEFAULT_LOB_RETURN_ADDRESS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    name: trimStr(o.name) || base.name,
    line1: trimStr(o.line1),
    line2: trimStr(o.line2),
    city: trimStr(o.city),
    state: trimStr(o.state),
    zip: trimStr(o.zip),
    country: trimStr(o.country) || "US",
  };
}

export function parseLobFulfillmentSettings(
  raw: Record<string, unknown> | null | undefined,
): LobFulfillmentSettings {
  if (!raw) return { ...DEFAULT_LOB_FULFILLMENT_SETTINGS, returnAddress: { ...DEFAULT_LOB_RETURN_ADDRESS } };

  const product = raw.productType;
  const productType: LobProductType =
    product === "letter_us_legal" || product === "postcard_4x6" ? product : "letter_us";

  const auto = raw.autoSendMode;
  const autoSendMode: LobAutoSendMode =
    auto === "immediate" || auto === "scheduled_batch" ? auto : "disabled";

  const env = raw.lobEnvironment;
  const lobEnvironment: "test" | "live" = env === "live" ? "live" : "test";

  const mail = raw.mailType;
  const mailType: LobMailType = mail === "usps_standard" ? "usps_standard" : "usps_first_class";

  const placement = raw.addressPlacement;
  const addressPlacement: LobAddressPlacement =
    placement === "insert_blank_page" ? "insert_blank_page" : "top_first_page";

  const autoSendFrequency = parseAutoSendFrequency(raw.autoSendFrequency);
  const minCards = Number(raw.batchMinQueuedCards);
  const maxRecipients = Number(raw.batchMaxRecipientsPerRun);
  const concurrency = Number(raw.submitConcurrency);

  return {
    lobEnabled: raw.lobEnabled === true,
    lobEnvironment,
    productType,
    autoSendMode,
    autoSendFrequency,
    batchIntervalMinutes: intervalMinutesForFrequency(autoSendFrequency),
    batchMinQueuedCards:
      Number.isFinite(minCards) && minCards >= 1 ? Math.floor(minCards) : DEFAULT_LOB_FULFILLMENT_SETTINGS.batchMinQueuedCards,
    batchMinRecipients: 0,
    batchMaxRecipientsPerRun:
      Number.isFinite(maxRecipients) && maxRecipients >= 1
        ? Math.floor(maxRecipients)
        : DEFAULT_LOB_FULFILLMENT_SETTINGS.batchMaxRecipientsPerRun,
    submitConcurrency:
      Number.isFinite(concurrency) && concurrency >= 1 && concurrency <= 10
        ? Math.floor(concurrency)
        : DEFAULT_LOB_FULFILLMENT_SETTINGS.submitConcurrency,
    color: raw.color !== false,
    doubleSided: raw.doubleSided !== false,
    mailType,
    addressPlacement,
    returnAddress: parseReturnAddress(raw.returnAddress),
    letterFormat: parseLobLetterFormat(raw.letterFormat),
  };
}

export function validateLobFulfillmentSettings(settings: LobFulfillmentSettings): string | null {
  if (
    settings.autoSendFrequency !== "daily" &&
    settings.autoSendFrequency !== "weekly" &&
    settings.autoSendFrequency !== "monthly"
  ) {
    return "autoSendFrequency must be daily, weekly, or monthly";
  }
  if (settings.batchIntervalMinutes < 5) return "batchIntervalMinutes must be >= 5";
  if (settings.batchMinQueuedCards < 1) return "batchMinQueuedCards must be >= 1";
  if (settings.batchMinRecipients < 0) return "batchMinRecipients must be >= 0";
  if (settings.batchMaxRecipientsPerRun < 1) return "batchMaxRecipientsPerRun must be >= 1";
  if (settings.submitConcurrency < 1 || settings.submitConcurrency > 10) {
    return "submitConcurrency must be between 1 and 10";
  }

  const letterErr = validateLobLetterFormat(settings.letterFormat);
  if (letterErr) return letterErr;

  if (settings.lobEnabled) {
    const addrErr = returnAddressValidationMessage(settings);
    if (addrErr) return addrErr;
    if (settings.productType === "postcard_4x6") {
      return "Postcard fulfillment via Lob is not implemented yet — use letter_us for now";
    }
    if (settings.productType === "letter_us_legal") {
      return "US Legal letters require Lob API 2024+ on your account — use letter_us for now";
    }
  }

  return null;
}

/** @deprecated Use returnAddressValidationMessage */
export function returnAddressReadinessMessage(settings: LobFulfillmentSettings): string | null {
  return returnAddressValidationMessage(settings);
}

/** Lob letter `size` param from product type. */
export function lobLetterSizeForProduct(product: LobProductType): "us_letter" | "us_legal" {
  return product === "letter_us_legal" ? "us_legal" : "us_letter";
}
