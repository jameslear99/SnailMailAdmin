import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";

/** List advertiser early-access waitlist signups (newest first). */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const snap = await getAdminDb()
      .collection("advertiserWaitlist")
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();

    const entries = snap.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt?.toDate?.() as Date | undefined;
      return {
        id: doc.id,
        name: String(data.name ?? ""),
        email: String(data.email ?? ""),
        source: String(data.source ?? "website"),
        createdAt: createdAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ entries });
  } catch (err) {
    console.error("advertiser waitlist list failed", err);
    return NextResponse.json({ error: "Could not load waitlist." }, { status: 500 });
  }
}
