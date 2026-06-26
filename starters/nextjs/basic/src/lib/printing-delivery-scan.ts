import type { DocumentData, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Same cap as `/api/printing/recipients` — full collection-group scan, no `where` (avoids index requirements). */
export const MAX_DELIVERY_DOCS_SCAN = 20_000;

export function normalizedRecipientId(data: DocumentData): string {
  const v = data.recipientUserId;
  return typeof v === "string" ? v.trim() : "";
}

/**
 * All `deliveries` docs (capped). Caller must check `snap.size >= MAX_DELIVERY_DOCS_SCAN` if completeness matters.
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
  return docs.filter((doc) => normalizedRecipientId(doc.data()) === uid);
}
