import { NextResponse } from "next/server";

import { buildQueueDetailPayload } from "@/lib/build-print-queue-detail";
import { getAdminDb } from "@/lib/firebase-admin";
import { MAX_DELIVERY_DOCS_SCAN, scanAllDeliveryDocs } from "@/lib/printing-delivery-scan";

/**
 * One recipient's physical fulfillment queue: eligible deliveries without
 * `physicalPrintedAt`, with parent `mailPosts` merged for artwork and message.
 * Not gated on `isDigitallyUnlocked` — ops see new sends immediately.
 *
 * Uses a capped collection-group scan + in-memory filter (same strategy as
 * `/api/printing/recipients`) so we do not rely on a single-field
 * `recipientUserId` collection-group index — avoids Firestore 9 FAILED_PRECONDITION.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const recipientUid = url.searchParams.get("recipientUid")?.trim();
    if (!recipientUid) {
      return NextResponse.json({ error: "recipientUid query parameter required" }, { status: 400 });
    }

    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(recipientUid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const allDeliveryDocs = await scanAllDeliveryDocs(db);
    if (allDeliveryDocs.length >= MAX_DELIVERY_DOCS_SCAN) {
      return NextResponse.json(
        {
          error: `Too many delivery documents (>= ${MAX_DELIVERY_DOCS_SCAN}). Increase cap or add aggregation.`,
        },
        { status: 413 },
      );
    }

    const postCache = new Map<string, Record<string, unknown> | null>();
    const payload = await buildQueueDetailPayload(db, recipientUid, allDeliveryDocs, postCache, {
      userSnapshot: userSnap,
    });

    return NextResponse.json(payload);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "queue-detail failed" },
      { status: 500 },
    );
  }
}
