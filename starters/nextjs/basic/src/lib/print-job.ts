/**
 * Lob print job records stored in Firestore `printJobs/{jobId}`.
 */

import { createHash } from "crypto";

import type { LobProductType } from "@/lib/lob-fulfillment-settings";

export type PrintJobStatus =
  | "pending"
  | "submitted"
  | "in_production"
  | "mailed"
  | "failed"
  | "cancelled";

export type PrintJobTrigger = "manual" | "auto";

export type PrintJobRecord = {
  id: string;
  recipientUid: string;
  recipientDisplayName?: string;
  productType: LobProductType;
  deliveryIds: string[];
  mailPostIds: string[];
  cardCount: number;
  status: PrintJobStatus;
  trigger: PrintJobTrigger;
  lobLetterId?: string;
  lobUrl?: string;
  lobTrackingNumber?: string | null;
  lobExpectedDeliveryDate?: string;
  errorMessage?: string;
  createdAt?: string;
  submittedAt?: string;
  mailedAt?: string;
  updatedAt?: string;
};

export const PRINT_JOBS_COLLECTION = "printJobs" as const;

export const LOB_LETTER_STATUS_TO_JOB: Record<string, PrintJobStatus> = {
  processed: "submitted",
  rendered: "in_production",
  mailed: "mailed",
  failed: "failed",
  cancelled: "cancelled",
};

/** Stable, bounded Firestore doc id from recipient + delivery set. */
export function printJobIdForRecipient(recipientUid: string, deliveryIds: string[]): string {
  const uid = recipientUid.trim().slice(0, 40);
  const sorted = [...deliveryIds].sort().join("|");
  const hash = createHash("sha256").update(sorted).digest("hex").slice(0, 24);
  return `lob_${uid}_${hash}`;
}

/** Child job id when resubmitting an existing print job to Lob. */
export function printJobResubmitId(parentJobId: string, sequence: number): string {
  return `${parentJobId}_rs${sequence}`.slice(0, 150);
}

export function parsePrintJobRecord(id: string, raw: Record<string, unknown> | null | undefined): PrintJobRecord {
  const statusRaw = typeof raw?.status === "string" ? raw.status : "pending";
  const status: PrintJobStatus =
    statusRaw === "submitted" ||
    statusRaw === "in_production" ||
    statusRaw === "mailed" ||
    statusRaw === "failed" ||
    statusRaw === "cancelled"
      ? statusRaw
      : "pending";

  const triggerRaw = raw?.trigger;
  const trigger: PrintJobTrigger = triggerRaw === "auto" ? "auto" : "manual";

  const product = raw?.productType;
  const productType: LobProductType =
    product === "letter_us_legal" || product === "postcard_4x6" ? product : "letter_us";

  const deliveryIds = Array.isArray(raw?.deliveryIds)
    ? raw.deliveryIds.filter((x): x is string => typeof x === "string")
    : [];
  const mailPostIds = Array.isArray(raw?.mailPostIds)
    ? raw.mailPostIds.filter((x): x is string => typeof x === "string")
    : [];

  return {
    id,
    recipientUid: typeof raw?.recipientUid === "string" ? raw.recipientUid : "",
    recipientDisplayName: typeof raw?.recipientDisplayName === "string" ? raw.recipientDisplayName : undefined,
    productType,
    deliveryIds,
    mailPostIds,
    cardCount: typeof raw?.cardCount === "number" ? raw.cardCount : deliveryIds.length,
    status,
    trigger,
    lobLetterId: typeof raw?.lobLetterId === "string" ? raw.lobLetterId : undefined,
    lobUrl: typeof raw?.lobUrl === "string" ? raw.lobUrl : undefined,
    lobTrackingNumber:
      typeof raw?.lobTrackingNumber === "string" || raw?.lobTrackingNumber === null
        ? (raw.lobTrackingNumber as string | null)
        : undefined,
    lobExpectedDeliveryDate:
      typeof raw?.lobExpectedDeliveryDate === "string" ? raw.lobExpectedDeliveryDate : undefined,
    errorMessage: typeof raw?.errorMessage === "string" ? raw.errorMessage : undefined,
    createdAt: typeof raw?.createdAt === "string" ? raw.createdAt : undefined,
    submittedAt: typeof raw?.submittedAt === "string" ? raw.submittedAt : undefined,
    mailedAt: typeof raw?.mailedAt === "string" ? raw.mailedAt : undefined,
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : undefined,
  };
}
