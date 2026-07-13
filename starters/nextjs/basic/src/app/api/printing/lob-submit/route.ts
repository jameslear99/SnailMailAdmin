import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { loadLobSettings, submitLobJobsForRecipients } from "@/lib/lob-submit-service";
import { requireAdminApi } from "@/lib/require-admin-api";

type Body = {
  recipientUid?: string;
  recipientUids?: string[];
};

function parseRecipientUids(raw: unknown): { uids: string[] } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "JSON body required" };
  const o = raw as Body;
  if (Array.isArray(o.recipientUids) && o.recipientUids.length > 0) {
    const uids = [...new Set(o.recipientUids.map((u) => String(u).trim()).filter(Boolean))];
    if (uids.length === 0) return { error: "recipientUids empty" };
    return { uids };
  }
  if (typeof o.recipientUid === "string" && o.recipientUid.trim()) {
    return { uids: [o.recipientUid.trim()] };
  }
  return { error: "recipientUid or recipientUids required" };
}

/** Manually submit Lob print jobs for one or more recipients. */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const parsed = parseRecipientUids(await req.json());
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const db = getAdminDb();
    const settings = await loadLobSettings(db);
    const result = await submitLobJobsForRecipients(db, settings, parsed.uids, "manual");

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob submit failed" },
      { status: 500 },
    );
  }
}
