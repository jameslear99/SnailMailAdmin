import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;

  try {
    const db = getAdminDb();
    const doc = await db.collection("mailPosts").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Mail post not found" }, { status: 404 });
    }

    const deliveriesSnap = await db
      .collection("mailPosts")
      .doc(id)
      .collection("deliveries")
      .limit(200)
      .get();

    const deliveries = deliveriesSnap.docs.map((d) => ({
      id: d.id,
      ...serializeDoc(d.data()),
    }));

    return NextResponse.json({
      id: doc.id,
      ...serializeDoc(doc.data()),
      deliveries,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load mail post" },
      { status: 500 },
    );
  }
}
