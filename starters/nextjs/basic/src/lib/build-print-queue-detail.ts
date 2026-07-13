import type { DocumentSnapshot, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

import { mailingAddressLinesFromUserDoc } from "@/lib/mailing-address";
import { isInPrintQueue, type DeliveryDocShape, type PrintQueueItem } from "@/lib/print-fulfillment";
import { filterDeliveryDocsForRecipient } from "@/lib/printing-delivery-scan";
import { serializeDoc } from "@/lib/serialize-firestore";

export type QueueDetailPayload = {
  recipientUid: string;
  user: Record<string, unknown> | null;
  addressLines: string[];
  items: PrintQueueItem[];
  count: number;
};

export function sortKeyForItem(item: PrintQueueItem): number {
  if (item.createdAt) {
    const t = Date.parse(item.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  const sent = item.mailPost?.sentAt;
  if (typeof sent === "string") {
    const t = Date.parse(sent);
    if (!Number.isNaN(t)) return t;
  }
  if (item.digitalUnlockAt) {
    const t = Date.parse(item.digitalUnlockAt);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

/**
 * Build one recipient’s print queue using a pre-fetched delivery scan (shared post cache).
 */
export async function buildQueueDetailPayload(
  db: Firestore,
  recipientUid: string,
  allDeliveryDocs: QueryDocumentSnapshot[],
  postCache: Map<string, Record<string, unknown> | null>,
  options?: { userSnapshot?: DocumentSnapshot },
): Promise<QueueDetailPayload> {
  const recipientTrim = recipientUid.trim();
  const userSnap =
    options?.userSnapshot ?? (await db.collection("users").doc(recipientTrim).get());
  const user = userSnap.exists ? serializeDoc(userSnap.data())! : null;
  const addressLines = user ? mailingAddressLinesFromUserDoc(user) : [];

  const qDocs = filterDeliveryDocsForRecipient(allDeliveryDocs, recipientTrim);
  const items: PrintQueueItem[] = [];

  for (const doc of qDocs) {
    const d = doc.data() as DeliveryDocShape;
    if (!isInPrintQueue(d)) continue;

    const mailPostId = typeof d.mailPostId === "string" ? d.mailPostId : "";
    if (!mailPostId) continue;

    let mailPost = postCache.get(mailPostId);
    if (mailPost === undefined) {
      const ps = await db.collection("mailPosts").doc(mailPostId).get();
      mailPost = ps.exists ? serializeDoc(ps.data())! : null;
      postCache.set(mailPostId, mailPost);
    }

    const ser = serializeDoc(doc.data())!;
    items.push({
      deliveryId: doc.id,
      mailPostId,
      deliveryStatus: typeof ser.deliveryStatus === "string" ? ser.deliveryStatus : undefined,
      digitalUnlockAt: typeof ser.digitalUnlockAt === "string" ? ser.digitalUnlockAt : undefined,
      createdAt: typeof ser.createdAt === "string" ? ser.createdAt : undefined,
      isDigitallyUnlocked: ser.isDigitallyUnlocked === true,
      mailPost,
    });
  }

  items.sort((a, b) => sortKeyForItem(a) - sortKeyForItem(b));

  return {
    recipientUid: recipientTrim,
    user,
    addressLines,
    items,
    count: items.length,
  };
}

/** Build queue items for explicit delivery ids (e.g. resubmitting a prior print job). */
export async function buildItemsFromDeliveryIds(
  db: Firestore,
  deliveryIds: string[],
  allDeliveryDocs: QueryDocumentSnapshot[],
  postCache: Map<string, Record<string, unknown> | null>,
): Promise<PrintQueueItem[]> {
  const wanted = new Set(deliveryIds.filter((id) => typeof id === "string" && id.trim()));
  if (wanted.size === 0) return [];

  const items: PrintQueueItem[] = [];
  for (const doc of allDeliveryDocs) {
    if (!wanted.has(doc.id)) continue;

    const d = doc.data() as DeliveryDocShape;
    const mailPostId = typeof d.mailPostId === "string" ? d.mailPostId : "";
    if (!mailPostId) continue;

    let mailPost = postCache.get(mailPostId);
    if (mailPost === undefined) {
      const ps = await db.collection("mailPosts").doc(mailPostId).get();
      mailPost = ps.exists ? serializeDoc(ps.data())! : null;
      postCache.set(mailPostId, mailPost);
    }

    const ser = serializeDoc(doc.data())!;
    items.push({
      deliveryId: doc.id,
      mailPostId,
      deliveryStatus: typeof ser.deliveryStatus === "string" ? ser.deliveryStatus : undefined,
      digitalUnlockAt: typeof ser.digitalUnlockAt === "string" ? ser.digitalUnlockAt : undefined,
      createdAt: typeof ser.createdAt === "string" ? ser.createdAt : undefined,
      isDigitallyUnlocked: ser.isDigitallyUnlocked === true,
      mailPost,
    });
  }

  items.sort((a, b) => sortKeyForItem(a) - sortKeyForItem(b));
  return items;
}
