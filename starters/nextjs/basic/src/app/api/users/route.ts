import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { resolveReceivesPhysicalMail } from "@/lib/physical-mail-entitlement";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

function userRowFromDocs(
  userId: string,
  userData: Record<string, unknown> | undefined,
  publicProfileData: Record<string, unknown> | undefined,
) {
  return {
    id: userId,
    ...serializeDoc(userData),
    snailmailPro: resolveReceivesPhysicalMail(userData, publicProfileData),
  };
}

async function loadPublicProfilesByUid(
  db: ReturnType<typeof getAdminDb>,
  uids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    const refs = chunk.map((uid) => db.collection("publicProfiles").doc(uid));
    const snaps = await db.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) out.set(snap.id, snap.data() as Record<string, unknown>);
    }
  }
  return out;
}

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
      const publicSnap = await db.collection("publicProfiles").doc(uid).get();
      return NextResponse.json({
        users: [
          userRowFromDocs(
            doc.id,
            doc.data(),
            publicSnap.exists ? (publicSnap.data() as Record<string, unknown>) : undefined,
          ),
        ],
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
    const uids = snap.docs.map((d) => d.id);
    const publicProfiles = await loadPublicProfilesByUid(db, uids);
    const users = snap.docs.map((d) =>
      userRowFromDocs(d.id, d.data(), publicProfiles.get(d.id)),
    );
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
