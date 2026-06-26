/**
 * In-house print queue metrics for `mailPosts/.../deliveries`.
 *
 * **Admin print queue** includes every delivery that is not `skipped_ineligible`
 * and not yet `physicalPrintedAt` — including `missing_address` so ops see
 * cards waiting on profile addresses. **In-app mailbox** metrics still exclude
 * `missing_address` and `skipped_ineligible` via [isEligibleMailRow].
 */

import { Timestamp } from "firebase-admin/firestore";

/** Excluded from recipient mailbox / digital-unlock tallies (matches Functions). */
export const DELIVERY_STATUS_EXCLUDED_FROM_MAILBOX = new Set([
  "skipped_ineligible",
  "missing_address",
]);

/** @deprecated Use [DELIVERY_STATUS_EXCLUDED_FROM_MAILBOX]. */
export const DELIVERY_STATUS_EXCLUDED = DELIVERY_STATUS_EXCLUDED_FROM_MAILBOX;

/** No physical piece — friendship/eligibility blocked (nothing to print). */
export const DELIVERY_STATUS_NO_POSTCARD = new Set(["skipped_ineligible"]);

export type DeliveryDocShape = {
  mailPostId?: string;
  recipientUserId?: string;
  deliveryStatus?: string;
  isDigitallyUnlocked?: boolean;
  senderSelectedAdIds?: unknown;
  platformAssignedAdId?: string | null;
  physicalPrintedAt?: unknown;
  /** Fan-out time (ISO string or Firestore Timestamp). */
  createdAt?: unknown;
};

function firestoreTimeToMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}

export function countsAdSlots(d: DeliveryDocShape): number {
  const list = d.senderSelectedAdIds;
  const n = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").length : 0;
  return n + (d.platformAssignedAdId ? 1 : 0);
}

export function hasPhysicalPrint(d: DeliveryDocShape): boolean {
  const t = d.physicalPrintedAt;
  return t != null && t !== "";
}

export function isEligibleMailRow(d: DeliveryDocShape): boolean {
  const st = d.deliveryStatus ?? "";
  return !DELIVERY_STATUS_EXCLUDED_FROM_MAILBOX.has(st);
}

/** Unlocked in app and counts toward mailbox — not skipped/missing. */
export function isDigitallyReceived(d: DeliveryDocShape): boolean {
  return isEligibleMailRow(d) && d.isDigitallyUnlocked === true;
}

/** Physical ops queue: any real postcard obligation not yet marked printed (incl. missing_address). */
export function isInPrintQueue(d: DeliveryDocShape): boolean {
  const st = d.deliveryStatus ?? "";
  if (DELIVERY_STATUS_NO_POSTCARD.has(st)) return false;
  return !hasPhysicalPrint(d);
}

export type RecipientRollup = {
  recipientUid: string;
  displayName?: string;
  username?: string;
  /** Digitally unlocked, eligible deliveries (in-app mailbox). */
  postsReceived: number;
  /** Subset with physicalPrintedAt set. */
  postsPhysicallyFulfilled: number;
  /** Eligible deliveries not yet marked printed/shipped (`awaiting_print`, `missing_address`, etc.). */
  queueCount: number;
  /** Sum of ad slot counts on unlocked eligible rows. */
  adSlotsOnReceived: number;
  /** Sum of ad slot counts on physically fulfilled rows. */
  adSlotsOnPrinted: number;
  /**
   * Latest delivery `createdAt` among real postcard rows (excludes `skipped_ineligible`) — proxy for last send.
   * ISO 8601 string.
   */
  lastMailSentAt?: string;
};

/** One row returned by `/api/printing/queue-detail` for browser printing. */
export type PrintQueueItem = {
  deliveryId: string;
  mailPostId: string;
  deliveryStatus?: string;
  digitalUnlockAt?: string;
  /** Delivery doc `createdAt` (fan-out time) — ISO string. */
  createdAt?: string;
  isDigitallyUnlocked?: boolean;
  mailPost: Record<string, unknown> | null;
};

export function emptyRollup(recipientUid: string): RecipientRollup {
  return {
    recipientUid,
    postsReceived: 0,
    postsPhysicallyFulfilled: 0,
    queueCount: 0,
    adSlotsOnReceived: 0,
    adSlotsOnPrinted: 0,
  };
}

export function consumeDeliveryIntoRollup(
  map: Map<string, RecipientRollup>,
  d: DeliveryDocShape,
): void {
  const uid = d.recipientUserId?.trim();
  if (!uid) return;

  let r = map.get(uid);
  if (!r) {
    r = emptyRollup(uid);
    map.set(uid, r);
  }

  const ads = countsAdSlots(d);
  const received = isDigitallyReceived(d);
  const printed = isEligibleMailRow(d) && hasPhysicalPrint(d);
  const queue = isInPrintQueue(d);

  if (received) {
    r.postsReceived += 1;
    r.adSlotsOnReceived += ads;
  }
  if (printed) {
    r.postsPhysicallyFulfilled += 1;
    r.adSlotsOnPrinted += ads;
  }
  if (queue) {
    r.queueCount += 1;
  }

  const status = d.deliveryStatus ?? "";
  if (!DELIVERY_STATUS_NO_POSTCARD.has(status)) {
    const ms = firestoreTimeToMs(d.createdAt);
    if (ms != null) {
      const prevMs = r.lastMailSentAt ? Date.parse(r.lastMailSentAt) : -Infinity;
      if (ms > prevMs) {
        r.lastMailSentAt = new Date(ms).toISOString();
      }
    }
  }
}
