import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
  );
  const cursor = url.searchParams.get("cursor")?.trim();
  const username = url.searchParams.get("username")?.trim().toLowerCase();

  try {
    const db = getAdminDb();

    if (username) {
      const card = await db.collection("usernames").doc(username).get();
      if (!card.exists) {
        return NextResponse.json({ users: [], nextCursor: null });
      }
      const uid = card.get("uid") as string | undefined;
      if (!uid) {
        return NextResponse.json({ users: [], nextCursor: null });
      }
      const doc = await db.collection("users").doc(uid).get();
      const data = serializeDoc(doc.data());
      return NextResponse.json({
        users: [{ id: doc.id, ...data }],
        nextCursor: null,
      });
    }

    let q = db.collection("users").orderBy("__name__").limit(limit);
    if (cursor) {
      const curSnap = await db.collection("users").doc(cursor).get();
      if (curSnap.exists) {
        q = q.startAfter(curSnap);
      }
    }

    const snap = await q.get();
    const users = snap.docs.map((d) => ({
      id: d.id,
      ...serializeDoc(d.data()),
    }));
    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit && last ? last.id : null;

    return NextResponse.json({ users, nextCursor });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load users" },
      { status: 500 },
    );
  }
}
