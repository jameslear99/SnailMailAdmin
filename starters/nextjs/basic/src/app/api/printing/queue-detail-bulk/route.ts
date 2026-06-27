import { NextResponse } from "next/server";

import { buildQueueDetailPayload, type QueueDetailPayload } from "@/lib/build-print-queue-detail";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";
import { MAX_DELIVERY_DOCS_SCAN, scanAllDeliveryDocs } from "@/lib/printing-delivery-scan";

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
 * One delivery-group scan + shared mailPost cache.
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
    const segments: QueueDetailPayload[] = [];
    for (const recipientUid of uids) {
      segments.push(
        await buildQueueDetailPayload(db, recipientUid, allDeliveryDocs, postCache),
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
