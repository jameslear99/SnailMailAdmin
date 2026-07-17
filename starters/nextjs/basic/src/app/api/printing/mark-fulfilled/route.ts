import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { isInPrintQueue, type DeliveryDocShape } from "@/lib/print-fulfillment";
import { queryRecipientDeliveries } from "@/lib/printing-delivery-scan";
import { requireAdminApi } from "@/lib/require-admin-api";

const BATCH_LIMIT = 400;

type Body = {
  recipientUid?: string;
  recipientUids?: string[];
};

function dedupePreserveOrder(uids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of uids) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function parseBody(raw: unknown): { uids: string[] } | { error: string } {
  if (!raw || typeof raw !== "object") {
    return { error: "JSON body required" };
  }
  const o = raw as Body;
  if (Array.isArray(o.recipientUids) && o.recipientUids.length > 0) {
    const uids = dedupePreserveOrder(o.recipientUids.map((u) => String(u).trim()).filter(Boolean));
    if (uids.length === 0) return { error: "recipientUids empty" };
    return { uids };
  }
  if (typeof o.recipientUid === "string" && o.recipientUid.trim()) {
    return { uids: [o.recipientUid.trim()] };
  }
  return { error: "recipientUid or recipientUids required" };
}

async function markQueueFulfilledForRecipient(db: Firestore, recipientUid: string): Promise<number> {
  const docs = await queryRecipientDeliveries(db, recipientUid);
  let marked = 0;
  let batch = db.batch();
  let ops = 0;

  for (const doc of docs) {
    const d = doc.data() as DeliveryDocShape;
    if (!isInPrintQueue(d)) continue;

    batch.set(
      doc.ref,
      {
        physicalPrintedAt: FieldValue.serverTimestamp(),
        isPhysicallyPrinted: true,
      },
      { merge: true },
    );
    marked += 1;
    ops += 1;

    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) {
    await batch.commit();
  }

  return marked;
}

async function markQueueFulfilledForRecipients(db: Firestore, uids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const uid of uids) {
    const trimmed = uid.trim();
    if (!trimmed) continue;
    counts.set(trimmed, await markQueueFulfilledForRecipient(db, trimmed));
  }
  return counts;
}

/**
 * Set `physicalPrintedAt` on all eligible, not-yet-printed deliveries for one or
 * more recipients (same rules as the printing queue — not tied to digital unlock).
 */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const raw = (await req.json()) as unknown;
    const parsed = parseBody(raw);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const db = getAdminDb();
    const countMap = await markQueueFulfilledForRecipients(db, parsed.uids);

    const results: { recipientUid: string; deliveriesMarked: number }[] = parsed.uids.map((recipientUid) => ({
      recipientUid,
      deliveriesMarked: countMap.get(recipientUid.trim()) ?? 0,
    }));

    const totalMarked = results.reduce((s, r) => s + r.deliveriesMarked, 0);

    return NextResponse.json({
      ok: true,
      results,
      totalMarked,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "mark-fulfilled failed",
      },
      { status: 500 },
    );
  }
}
