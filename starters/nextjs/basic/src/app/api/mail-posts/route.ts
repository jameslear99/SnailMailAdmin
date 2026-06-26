import type { Query } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { serializeDoc } from "@/lib/serialize-firestore";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 80;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
  );
  const cursorId = url.searchParams.get("cursor")?.trim();

  try {
    const db = getAdminDb();
    let q: Query = db.collection("mailPosts").orderBy("sentAt", "desc").limit(limit);

    if (cursorId) {
      const cur = await db.collection("mailPosts").doc(cursorId).get();
      if (cur.exists) {
        q = q.startAfter(cur);
      }
    }

    const snap = await q.get();
    const mailPosts = snap.docs.map((d) => ({
      id: d.id,
      ...serializeDoc(d.data()),
    }));
    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit && last ? last.id : null;

    return NextResponse.json({ mailPosts, nextCursor });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load mail posts" },
      { status: 500 },
    );
  }
}
