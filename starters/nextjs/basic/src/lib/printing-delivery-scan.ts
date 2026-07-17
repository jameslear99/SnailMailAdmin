import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

import { hasPhysicalPrint, type DeliveryDocShape } from "@/lib/print-fulfillment";

/** Page size for indexed delivery scans. */
export const DELIVERY_SCAN_PAGE_SIZE = 500;

/** @deprecated Use DELIVERY_SCAN_PAGE_SIZE */
export const AWAITING_PRINT_PAGE_SIZE = DELIVERY_SCAN_PAGE_SIZE;

/** Safety cap on scan pages per processor run (500 × 200 = 100k docs). */
export const AWAITING_PRINT_MAX_PAGES_PER_RUN = 200;

/** Default max pages for dashboard rollup scans (500 × 400 = 200k docs). */
export const ROLLUP_SCAN_MAX_PAGES = 400;

/**
 * @deprecated Legacy cap — queue routes no longer use this limit.
 */
export const MAX_DELIVERY_DOCS_SCAN = 20_000;

export const AWAITING_PRINT_STATUS = "awaiting_print";

export function normalizedRecipientId(data: Record<string, unknown> | undefined): string {
  const v = data?.recipientUserId;
  return typeof v === "string" ? v.trim() : "";
}

/** Eligible for Lob auto-send: awaiting print and not yet physically fulfilled. */
export function isAwaitingPrintUnprinted(d: DeliveryDocShape): boolean {
  return (d.deliveryStatus ?? "") === AWAITING_PRINT_STATUS && !hasPhysicalPrint(d);
}

function allDeliveriesBaseQuery(db: Firestore) {
  return db.collectionGroup("deliveries").orderBy("createdAt");
}

function recipientDeliveriesQuery(db: Firestore, recipientUid: string) {
  return db
    .collectionGroup("deliveries")
    .where("recipientUserId", "==", recipientUid.trim())
    .orderBy("createdAt");
}

export type DeliveryPageScanMeta = {
  totalDocsRead: number;
  pagesScanned: number;
  scanComplete: boolean;
  warnings: string[];
};

/**
 * Paginate all delivery docs (collection group, ordered by createdAt).
 * Invokes `onPage` for each page — avoids loading the full set into memory.
 */
export async function forEachDeliveryPage(
  db: Firestore,
  onPage: (docs: QueryDocumentSnapshot[]) => void | Promise<void>,
  options?: { pageSize?: number; maxPages?: number | null },
): Promise<DeliveryPageScanMeta> {
  const pageSize = options?.pageSize ?? DELIVERY_SCAN_PAGE_SIZE;
  const maxPages = options?.maxPages === undefined ? ROLLUP_SCAN_MAX_PAGES : options.maxPages;
  const warnings: string[] = [];

  let pagesScanned = 0;
  let totalDocsRead = 0;
  let cursor: QueryDocumentSnapshot | undefined;

  while (maxPages === null || pagesScanned < maxPages) {
    let q = allDeliveriesBaseQuery(db).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) {
      return { totalDocsRead, pagesScanned, scanComplete: true, warnings };
    }

    await onPage(snap.docs);
    totalDocsRead += snap.size;
    pagesScanned += 1;
    cursor = snap.docs[snap.docs.length - 1];

    if (snap.size < pageSize) {
      return { totalDocsRead, pagesScanned, scanComplete: true, warnings };
    }
  }

  warnings.push(
    `Delivery scan paused after ${pagesScanned} pages (${totalDocsRead} docs). Results may be incomplete.`,
  );
  return { totalDocsRead, pagesScanned, scanComplete: false, warnings };
}

/** All delivery docs for one recipient (indexed, paginated). */
export async function queryRecipientDeliveries(
  db: Firestore,
  recipientUid: string,
  pageSize = DELIVERY_SCAN_PAGE_SIZE,
): Promise<QueryDocumentSnapshot[]> {
  const uid = recipientUid.trim();
  const out: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    let q = recipientDeliveriesQuery(db, uid).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    out.push(...snap.docs);
    if (snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return out;
}

function awaitingPrintBaseQuery(db: Firestore) {
  return db
    .collectionGroup("deliveries")
    .where("deliveryStatus", "==", AWAITING_PRINT_STATUS)
    .orderBy("createdAt");
}

function recipientAwaitingPrintQuery(db: Firestore, recipientUid: string) {
  return db
    .collectionGroup("deliveries")
    .where("recipientUserId", "==", recipientUid.trim())
    .where("deliveryStatus", "==", AWAITING_PRINT_STATUS)
    .orderBy("createdAt");
}

export type AwaitingPrintScanResult = {
  recipientCounts: Map<string, number>;
  totalDocsRead: number;
  pagesScanned: number;
  unprintedCount: number;
  scanComplete: boolean;
  resumeAfterPath: string | null;
  warnings: string[];
};

/**
 * Paginated collection-group scan of awaiting-print deliveries.
 * Aggregates unprinted counts per recipient. Supports resuming via `resumeAfterPath`.
 */
export async function scanAwaitingPrintByRecipient(
  db: Firestore,
  options?: {
    pageSize?: number;
    maxPages?: number;
    resumeAfterPath?: string | null;
    seedCounts?: Map<string, number>;
  },
): Promise<AwaitingPrintScanResult> {
  const pageSize = options?.pageSize ?? AWAITING_PRINT_PAGE_SIZE;
  const maxPages = options?.maxPages ?? AWAITING_PRINT_MAX_PAGES_PER_RUN;
  const counts = new Map(options?.seedCounts ?? []);
  const warnings: string[] = [];

  let resumeAfter: QueryDocumentSnapshot | undefined;
  if (options?.resumeAfterPath?.trim()) {
    const cursorSnap = await db.doc(options.resumeAfterPath.trim()).get();
    if (cursorSnap.exists) {
      resumeAfter = cursorSnap as QueryDocumentSnapshot;
    } else {
      warnings.push(`Scan resume cursor missing (${options.resumeAfterPath}); starting from beginning.`);
    }
  }

  let pagesScanned = 0;
  let totalDocsRead = 0;
  let unprintedCount = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;

  while (pagesScanned < maxPages) {
    let q = awaitingPrintBaseQuery(db).limit(pageSize);
    if (resumeAfter) q = q.startAfter(resumeAfter);

    const snap = await q.get();
    if (snap.empty) {
      return {
        recipientCounts: counts,
        totalDocsRead,
        pagesScanned,
        unprintedCount,
        scanComplete: true,
        resumeAfterPath: null,
        warnings,
      };
    }

    for (const doc of snap.docs) {
      const d = doc.data() as DeliveryDocShape;
      if (!isAwaitingPrintUnprinted(d)) continue;
      unprintedCount += 1;
      const uid = normalizedRecipientId(doc.data() as Record<string, unknown>);
      if (!uid) continue;
      counts.set(uid, (counts.get(uid) ?? 0) + 1);
    }

    totalDocsRead += snap.size;
    pagesScanned += 1;
    lastDoc = snap.docs[snap.docs.length - 1]!;
    resumeAfter = lastDoc;

    if (snap.size < pageSize) {
      return {
        recipientCounts: counts,
        totalDocsRead,
        pagesScanned,
        unprintedCount,
        scanComplete: true,
        resumeAfterPath: null,
        warnings,
      };
    }
  }

  warnings.push(
    `Scan paused after ${pagesScanned} pages (${totalDocsRead} docs read). Will resume on next processor run.`,
  );

  return {
    recipientCounts: counts,
    totalDocsRead,
    pagesScanned,
    unprintedCount,
    scanComplete: false,
    resumeAfterPath: lastDoc?.ref.path ?? null,
    warnings,
  };
}

/** All unprinted awaiting-print delivery docs for one recipient (paginated query). */
export async function queryRecipientAwaitingPrintDeliveries(
  db: Firestore,
  recipientUid: string,
  pageSize = AWAITING_PRINT_PAGE_SIZE,
): Promise<QueryDocumentSnapshot[]> {
  const uid = recipientUid.trim();
  const out: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;

  while (true) {
    let q = recipientAwaitingPrintQuery(db, uid).limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      if (isAwaitingPrintUnprinted(doc.data() as DeliveryDocShape)) {
        out.push(doc);
      }
    }

    if (snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return out;
}

/**
 * @deprecated Use indexed queries. Full collection-group scan (capped).
 */
export async function scanAllDeliveryDocs(db: Firestore): Promise<QueryDocumentSnapshot[]> {
  const snap = await db.collectionGroup("deliveries").limit(MAX_DELIVERY_DOCS_SCAN).get();
  return snap.docs;
}

export function filterDeliveryDocsForRecipient(
  docs: QueryDocumentSnapshot[],
  recipientUid: string,
): QueryDocumentSnapshot[] {
  const uid = recipientUid.trim();
  return docs.filter((doc) => normalizedRecipientId(doc.data() as Record<string, unknown>) === uid);
}
