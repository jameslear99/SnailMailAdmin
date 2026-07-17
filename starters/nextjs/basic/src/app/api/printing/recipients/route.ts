import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  consumeDeliveryIntoRollup,
  emptyRollup,
  type DeliveryDocShape,
  type RecipientRollup,
} from "@/lib/print-fulfillment";
import { forEachDeliveryPage } from "@/lib/printing-delivery-scan";
import { requireAdminApi } from "@/lib/require-admin-api";

type UserDoc = {
  displayName?: unknown;
  username?: unknown;
};

function readDelivery(data: Record<string, unknown>): DeliveryDocShape {
  return data as DeliveryDocShape;
}

async function loadUsersByIds(
  db: Firestore,
  uids: string[],
): Promise<Map<string, UserDoc>> {
  const out = new Map<string, UserDoc>();
  const unique = [...new Set(uids.filter(Boolean))];

  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const refs = chunk.map((uid) => db.collection("users").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) out.set(snap.id, snap.data() as UserDoc);
    }
  }

  return out;
}

/**
 * Recipient-centric printing dashboard: paginated delivery scan + per-recipient user lookup.
 */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const byRecipient = new Map<string, RecipientRollup>();
    const deliveryStatusCounts: Record<string, number> = {};

    const scanMeta = await forEachDeliveryPage(db, async (docs) => {
      for (const doc of docs) {
        const data = doc.data() as Record<string, unknown>;
        const st = String((data.deliveryStatus as string | undefined) ?? "").trim() || "(empty)";
        deliveryStatusCounts[st] = (deliveryStatusCounts[st] ?? 0) + 1;
        consumeDeliveryIntoRollup(byRecipient, readDelivery(data));
      }
    });

    const uids = [...byRecipient.keys()];
    const usersById = await loadUsersByIds(db, uids);

    const rows: RecipientRollup[] = uids.map((uid) => {
      const base = byRecipient.get(uid) ?? emptyRollup(uid);
      const user = usersById.get(uid);
      const displayName = typeof user?.displayName === "string" ? user.displayName : undefined;
      const username = typeof user?.username === "string" ? user.username : undefined;
      return {
        ...base,
        displayName,
        username,
        recipientUid: uid,
      };
    });

    rows.sort((a, b) => {
      if (b.queueCount !== a.queueCount) return b.queueCount - a.queueCount;
      return (a.displayName ?? a.recipientUid).localeCompare(b.displayName ?? b.recipientUid);
    });

    return NextResponse.json({
      recipients: rows,
      meta: {
        deliveryDocumentsRead: scanMeta.totalDocsRead,
        deliveryScanPages: scanMeta.pagesScanned,
        deliveryScanComplete: scanMeta.scanComplete,
        deliveryScanWarnings: scanMeta.warnings,
        deliveryStatusCounts,
        distinctRecipientsWithDeliveries: byRecipient.size,
      },
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "Failed to load printing recipients";
    if (msg.includes("index")) {
      return NextResponse.json(
        {
          error:
            "Firestore index required for delivery rollup scan. From SnailMailSocial/, run: firebase deploy --only firestore:indexes (fieldOverrides: deliveries.createdAt collection group).",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
