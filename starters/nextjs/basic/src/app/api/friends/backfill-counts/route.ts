import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";

const BATCH_LIMIT = 400;

/**
 * A friendship row counts toward [uid] if the row exists and [uid] has not
 * blocked it. Mirrors the client `watchFriends` filter and the Cloud Function
 * `friendshipCountsTowardUser`.
 */
function friendshipCountsTowardUser(data: DocumentData, uid: string): boolean {
  const uids = data.uids as string[] | undefined;
  if (!uids || uids.length !== 2 || !uids.includes(uid)) return false;
  const user1Uid = (data.user1Uid as string | undefined) ?? "";
  const isUser1 = user1Uid === uid;
  return isUser1
    ? !(data.user1Blocked as boolean | undefined)
    : !(data.user2Blocked as boolean | undefined);
}

/**
 * Recompute `publicProfiles/{uid}.friendsCount` for every user that appears in
 * any `friendships` document. Idempotent — safe to run repeatedly.
 */
export async function POST() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("friendships").get();

    // Tally non-blocked friendships per user.
    const counts = new Map<string, number>();
    for (const doc of snap.docs) {
      const data = doc.data();
      const uids = (data.uids as string[] | undefined) ?? [];
      for (const uid of uids) {
        if (!counts.has(uid)) counts.set(uid, 0);
        if (friendshipCountsTowardUser(data, uid)) {
          counts.set(uid, (counts.get(uid) ?? 0) + 1);
        }
      }
    }

    // Write each user's absolute count to publicProfiles (chunked batches).
    let batch = db.batch();
    let ops = 0;
    for (const [uid, count] of counts) {
      batch.set(
        db.collection("publicProfiles").doc(uid),
        {
          uid,
          friendsCount: count,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      ops++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    return NextResponse.json({
      ok: true,
      usersUpdated: counts.size,
      friendshipsScanned: snap.size,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backfill-counts failed" },
      { status: 500 },
    );
  }
}
