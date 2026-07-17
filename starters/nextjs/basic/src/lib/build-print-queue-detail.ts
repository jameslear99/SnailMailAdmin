import type { DocumentSnapshot, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

import { mailingAddressLinesFromUserDoc } from "@/lib/mailing-address";
import { isInPrintQueue, type DeliveryDocShape, type PrintQueueItem } from "@/lib/print-fulfillment";
import {
  isAwaitingPrintUnprinted,
  queryRecipientAwaitingPrintDeliveries,
  queryRecipientDeliveries,
} from "@/lib/printing-delivery-scan";
import { serializeDoc } from "@/lib/serialize-firestore";

export type QueueDetailPayload = {
  recipientUid: string;
  user: Record<string, unknown> | null;
  addressLines: string[];
  items: PrintQueueItem[];
  count: number;
};

export type QueueDetailScope = "print_queue" | "awaiting_print";

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

function includeDocForScope(d: DeliveryDocShape, scope: QueueDetailScope): boolean {
  if (scope === "awaiting_print") return isAwaitingPrintUnprinted(d);
  return isInPrintQueue(d);
}

async function loadDeliveryDocs(
  db: Firestore,
  recipientUid: string,
  scope: QueueDetailScope,
): Promise<QueryDocumentSnapshot[]> {
  if (scope === "awaiting_print") {
    return queryRecipientAwaitingPrintDeliveries(db, recipientUid);
  }
  return queryRecipientDeliveries(db, recipientUid);
}

async function docsToQueueItems(
  db: Firestore,
  docs: QueryDocumentSnapshot[],
  scope: QueueDetailScope,
  postCache: Map<string, Record<string, unknown> | null>,
): Promise<PrintQueueItem[]> {
  const items: PrintQueueItem[] = [];

  for (const doc of docs) {
    const d = doc.data() as DeliveryDocShape;
    if (!includeDocForScope(d, scope)) continue;

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

/** Build one recipient's queue via indexed per-recipient queries (scalable path). */
export async function buildQueueDetailForRecipient(
  db: Firestore,
  recipientUid: string,
  postCache: Map<string, Record<string, unknown> | null>,
  options?: { userSnapshot?: DocumentSnapshot; scope?: QueueDetailScope },
): Promise<QueueDetailPayload> {
  const recipientTrim = recipientUid.trim();
  const scope = options?.scope ?? "print_queue";
  const userSnap =
    options?.userSnapshot ?? (await db.collection("users").doc(recipientTrim).get());
  const user = userSnap.exists ? serializeDoc(userSnap.data())! : null;
  const addressLines = user ? mailingAddressLinesFromUserDoc(user) : [];

  const docs = await loadDeliveryDocs(db, recipientTrim, scope);
  const items = await docsToQueueItems(db, docs, scope, postCache);

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
  mailPostIds: string[],
  recipientUid: string,
  postCache: Map<string, Record<string, unknown> | null>,
): Promise<PrintQueueItem[]> {
  const wanted = new Set(deliveryIds.filter((id) => typeof id === "string" && id.trim()));
  if (wanted.size === 0) return [];

  const uid = recipientUid.trim();
  const items: PrintQueueItem[] = [];

  for (const deliveryId of deliveryIds) {
    if (!wanted.has(deliveryId)) continue;

    const mailPostId = mailPostIds.find((id) => deliveryId === `${id}_${uid}`);
    if (!mailPostId) continue;

    const doc = await db
      .collection("mailPosts")
      .doc(mailPostId)
      .collection("deliveries")
      .doc(deliveryId)
      .get();
    if (!doc.exists) continue;

    const d = doc.data() as DeliveryDocShape;
    const mailPostIdFromDoc = typeof d.mailPostId === "string" ? d.mailPostId : mailPostId;

    let mailPost = postCache.get(mailPostIdFromDoc);
    if (mailPost === undefined) {
      const ps = await db.collection("mailPosts").doc(mailPostIdFromDoc).get();
      mailPost = ps.exists ? serializeDoc(ps.data())! : null;
      postCache.set(mailPostIdFromDoc, mailPost);
    }

    const ser = serializeDoc(doc.data())!;
    items.push({
      deliveryId: doc.id,
      mailPostId: mailPostIdFromDoc,
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
