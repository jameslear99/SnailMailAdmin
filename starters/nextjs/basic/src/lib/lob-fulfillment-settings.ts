/**
 * Lob print & mail configuration.
 * Stored in Firestore under `adminSettings/lobFulfillment`.
 */

export type LobProductType = "letter_us" | "letter_us_legal" | "postcard_4x6";

export type LobAutoSendMode = "disabled" | "immediate" | "scheduled_batch";

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
  /** How often the auto processor may run (scheduled_batch). */
  batchIntervalMinutes: number;
  /** Min queued cards on a recipient before auto batch includes them (1 = any). */
  batchMinQueuedCards: number;
  /** Min distinct recipients with eligible queue before a batch run fires (0 = no minimum). */
  batchMinRecipients: number;
  /** Cap recipients submitted per auto run. */
  batchMaxRecipientsPerRun: number;
  color: boolean;
  doubleSided: boolean;
  mailType: LobMailType;
  addressPlacement: LobAddressPlacement;
  returnAddress: LobReturnAddress;
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
  batchIntervalMinutes: 60,
  batchMinQueuedCards: 1,
  batchMinRecipients: 0,
  batchMaxRecipientsPerRun: 25,
  color: true,
  doubleSided: true,
  mailType: "usps_first_class",
  addressPlacement: "top_first_page",
  returnAddress: { ...DEFAULT_LOB_RETURN_ADDRESS },
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

  const interval = Number(raw.batchIntervalMinutes);
  const minCards = Number(raw.batchMinQueuedCards);
  const minRecipients = Number(raw.batchMinRecipients);
  const maxRecipients = Number(raw.batchMaxRecipientsPerRun);

  return {
    lobEnabled: raw.lobEnabled === true,
    lobEnvironment,
    productType,
    autoSendMode,
    batchIntervalMinutes:
      Number.isFinite(interval) && interval >= 5 ? Math.floor(interval) : DEFAULT_LOB_FULFILLMENT_SETTINGS.batchIntervalMinutes,
    batchMinQueuedCards:
      Number.isFinite(minCards) && minCards >= 1 ? Math.floor(minCards) : DEFAULT_LOB_FULFILLMENT_SETTINGS.batchMinQueuedCards,
    batchMinRecipients:
      Number.isFinite(minRecipients) && minRecipients >= 0
        ? Math.floor(minRecipients)
        : DEFAULT_LOB_FULFILLMENT_SETTINGS.batchMinRecipients,
    batchMaxRecipientsPerRun:
      Number.isFinite(maxRecipients) && maxRecipients >= 1
        ? Math.floor(maxRecipients)
        : DEFAULT_LOB_FULFILLMENT_SETTINGS.batchMaxRecipientsPerRun,
    color: raw.color !== false,
    doubleSided: raw.doubleSided !== false,
    mailType,
    addressPlacement,
    returnAddress: parseReturnAddress(raw.returnAddress),
  };
}

export function validateLobFulfillmentSettings(settings: LobFulfillmentSettings): string | null {
  if (settings.batchIntervalMinutes < 5) return "batchIntervalMinutes must be >= 5";
  if (settings.batchMinQueuedCards < 1) return "batchMinQueuedCards must be >= 1";
  if (settings.batchMinRecipients < 0) return "batchMinRecipients must be >= 0";
  if (settings.batchMaxRecipientsPerRun < 1) return "batchMaxRecipientsPerRun must be >= 1";

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
