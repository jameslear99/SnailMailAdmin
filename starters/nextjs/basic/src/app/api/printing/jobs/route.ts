import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { parsePrintJobRecord, PRINT_JOBS_COLLECTION, type PrintJobRecord } from "@/lib/print-job";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

const DEFAULT_LIMIT = 100;

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT));
    const statusFilter = url.searchParams.get("status")?.trim();

    const db = getAdminDb();
    let query = db.collection(PRINT_JOBS_COLLECTION).orderBy("createdAt", "desc").limit(limit);

    if (statusFilter) {
      query = db
        .collection(PRINT_JOBS_COLLECTION)
        .where("status", "==", statusFilter)
        .orderBy("createdAt", "desc")
        .limit(limit);
    }

    const snap = await query.get();
    const jobs: PrintJobRecord[] = snap.docs.map((doc) =>
      parsePrintJobRecord(doc.id, serializeDoc(doc.data()) ?? undefined),
    );

    return NextResponse.json({
      jobs,
      count: jobs.length,
      capped: snap.size >= limit,
    });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "jobs GET failed";
    if (msg.includes("index")) {
      return NextResponse.json(
        {
          error:
            "Firestore index required for filtered job queries. Try without ?status= or create a composite index on printJobs (status, createdAt).",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
