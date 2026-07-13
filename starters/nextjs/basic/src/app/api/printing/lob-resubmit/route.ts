import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { loadLobSettings, resubmitPrintJob } from "@/lib/lob-submit-service";
import { requireAdminApi } from "@/lib/require-admin-api";

type Body = {
  jobId?: string;
};

/** Resubmit a successful print job to Lob (creates a new letter + print job record). */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as Body;
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const db = getAdminDb();
    const settings = await loadLobSettings(db);
    const result = await resubmitPrintJob(db, settings, jobId);

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob resubmit failed" },
      { status: 500 },
    );
  }
}
