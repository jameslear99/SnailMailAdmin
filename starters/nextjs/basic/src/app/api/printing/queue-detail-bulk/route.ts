import { NextResponse } from "next/server";

import { buildQueueDetailForRecipient, type QueueDetailPayload } from "@/lib/build-print-queue-detail";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";

function parseRecipientUids(raw: string | null): string[] {
  if (!raw?.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of raw.split(",")) {
    const uid = p.trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    out.push(uid);
  }
  return out;
}

/**
 * Same data as `/api/printing/queue-detail` for multiple recipients, in request order.
 * Indexed per-recipient queries + shared mailPost cache.
 */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const uids = parseRecipientUids(url.searchParams.get("recipientUids"));
    if (uids.length === 0) {
      return NextResponse.json({ error: "recipientUids query parameter required (comma-separated)" }, { status: 400 });
    }

    const db = getAdminDb();
    const postCache = new Map<string, Record<string, unknown> | null>();
    const segments: QueueDetailPayload[] = [];

    for (const recipientUid of uids) {
      segments.push(
        await buildQueueDetailForRecipient(db, recipientUid, postCache, { scope: "print_queue" }),
      );
    }

    const totalCards = segments.reduce((s, seg) => s + seg.count, 0);

    return NextResponse.json({
      segments,
      recipientCount: segments.length,
      totalCards,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "queue-detail-bulk failed" },
      { status: 500 },
    );
  }
}
