import { NextResponse } from "next/server";

import { buildQueueDetailForRecipient } from "@/lib/build-print-queue-detail";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";

/**
 * One recipient's physical fulfillment queue: eligible deliveries without
 * `physicalPrintedAt`, with parent `mailPosts` merged for artwork and message.
 */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

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

    const postCache = new Map<string, Record<string, unknown> | null>();
    const payload = await buildQueueDetailForRecipient(db, recipientUid, postCache, {
      userSnapshot: userSnap,
      scope: "print_queue",
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
