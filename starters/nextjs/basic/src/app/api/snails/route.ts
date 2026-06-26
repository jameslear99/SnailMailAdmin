import {
  FieldPath,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { serializeDoc } from "@/lib/serialize-firestore";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

function userDocToSnailRow(doc: DocumentSnapshot) {
  const data = doc.data();
  if (!data) return null;
  const snail = (data.snail ?? {}) as Record<string, unknown>;
  const serialized = serializeDoc(snail) ?? {};
  const snailId = String(snail.id ?? "");
  return {
    id: snailId || doc.id,
    ownerUid: doc.id,
    ...serialized,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
  );
  const cursorId = url.searchParams.get("cursor")?.trim();
  const ownerUid = url.searchParams.get("ownerUid")?.trim();

  try {
    const db = getAdminDb();

    if (ownerUid) {
      const doc = await db.collection("users").doc(ownerUid).get();
      if (!doc.exists) {
        return NextResponse.json({ snails: [], nextCursor: null });
      }
      const row = userDocToSnailRow(doc);
      return NextResponse.json({ snails: row ? [row] : [], nextCursor: null });
    }

    let q = db.collection("users").orderBy(FieldPath.documentId()).limit(limit);
    if (cursorId) {
      const cur = await db.collection("users").doc(cursorId).get();
      if (cur.exists) {
        q = q.startAfter(cur);
      }
    }

    const snap = await q.get();
    const snails = snap.docs
      .map((d) => userDocToSnailRow(d))
      .filter((row): row is NonNullable<typeof row> => row != null);

    const last = snap.docs[snap.docs.length - 1];
    const nextCursor = snap.size === limit && last ? last.id : null;

    return NextResponse.json({ snails, nextCursor });
  } catch (e) {
    console.error(e);
    try {
      const db = getAdminDb();
      const snap = await db.collection("users").limit(limit).get();
      const snails = snap.docs
        .map((d) => userDocToSnailRow(d))
        .filter((row): row is NonNullable<typeof row> => row != null);
      return NextResponse.json({
        snails,
        nextCursor: null,
        note: "unordered_fallback",
      });
    } catch (e2) {
      return NextResponse.json(
        { error: e2 instanceof Error ? e2.message : "Failed to load snails" },
        { status: 500 },
      );
    }
  }
}
