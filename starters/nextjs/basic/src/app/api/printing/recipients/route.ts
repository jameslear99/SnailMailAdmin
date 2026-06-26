import { type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { MAX_DELIVERY_DOCS_SCAN } from "@/lib/printing-delivery-scan";
import {
  consumeDeliveryIntoRollup,
  emptyRollup,
  type DeliveryDocShape,
  type RecipientRollup,
} from "@/lib/print-fulfillment";

const MAX_USERS = 500;

type UserDoc = {
  displayName?: unknown;
  username?: unknown;
};

function readDelivery(doc: QueryDocumentSnapshot): DeliveryDocShape {
  return doc.data() as DeliveryDocShape;
}

/**
 * Recipient-centric printing dashboard: merge all `deliveries` with `users`
 * (cap 500 users) for queue / received / ad-slot counts.
 */
export async function GET() {
  try {
    const db = getAdminDb();

    const deliveriesSnap = await db.collectionGroup("deliveries").limit(MAX_DELIVERY_DOCS_SCAN).get();

    if (deliveriesSnap.size >= MAX_DELIVERY_DOCS_SCAN) {
      return NextResponse.json(
        {
          error: `Too many delivery documents (>= ${MAX_DELIVERY_DOCS_SCAN}). Increase cap or add aggregation.`,
        },
        { status: 413 },
      );
    }

    const byRecipient = new Map<string, RecipientRollup>();
    const deliveryStatusCounts: Record<string, number> = {};
    for (const doc of deliveriesSnap.docs) {
      const st = String((doc.data().deliveryStatus as string | undefined) ?? "").trim() || "(empty)";
      deliveryStatusCounts[st] = (deliveryStatusCounts[st] ?? 0) + 1;
      consumeDeliveryIntoRollup(byRecipient, readDelivery(doc));
    }

    const usersSnap = await db.collection("users").orderBy("__name__").limit(MAX_USERS).get();

    const rows: RecipientRollup[] = [];

    for (const u of usersSnap.docs) {
      const uid = u.id;
      const data = u.data() as UserDoc;
      const base = byRecipient.get(uid) ?? emptyRollup(uid);
      const displayName = typeof data.displayName === "string" ? data.displayName : undefined;
      const username = typeof data.username === "string" ? data.username : undefined;
      rows.push({
        ...base,
        displayName,
        username,
        recipientUid: uid,
      });
    }

    for (const [uid, rollup] of byRecipient) {
      if (usersSnap.docs.some((d) => d.id === uid)) continue;
      rows.push({ ...rollup });
    }

    rows.sort((a, b) => {
      if (b.queueCount !== a.queueCount) return b.queueCount - a.queueCount;
      return (a.displayName ?? a.recipientUid).localeCompare(b.displayName ?? b.recipientUid);
    });

    return NextResponse.json({
      recipients: rows,
      userCap: MAX_USERS,
      meta: {
        deliveryDocumentsRead: deliveriesSnap.size,
        deliveryStatusCounts,
        distinctRecipientsWithDeliveries: byRecipient.size,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load printing recipients" },
      { status: 500 },
    );
  }
}
