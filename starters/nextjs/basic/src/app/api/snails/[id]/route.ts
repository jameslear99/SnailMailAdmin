import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";
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
    const snap = await db.collection("users").where("snail.id", "==", id).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ error: "Snail not found" }, { status: 404 });
    }
    const doc = snap.docs[0];
    const snail = doc.get("snail") as Record<string, unknown> | undefined;
    const serialized = serializeDoc(snail);
    if (!serialized) {
      return NextResponse.json({ error: "Snail not found" }, { status: 404 });
    }
    return NextResponse.json({
      id,
      ownerUid: doc.id,
      ...serialized,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load snail" },
      { status: 500 },
    );
  }
}

type PatchBody = {
  level?: number;
  xp?: number;
  appearance?: Record<string, unknown>;
};

/** Partial updates for support / art tweaks — merges into `users` + `publicProfiles` when embedded `snail.id` matches. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.level !== undefined) {
    if (typeof body.level !== "number" || body.level < 1) {
      return NextResponse.json({ error: "level must be a number ≥ 1" }, { status: 400 });
    }
    patch.level = body.level;
  }
  if (body.xp !== undefined) {
    if (typeof body.xp !== "number" || body.xp < 0) {
      return NextResponse.json({ error: "xp must be a non-negative number" }, { status: 400 });
    }
    patch.xp = body.xp;
  }
  if (body.appearance !== undefined) {
    if (typeof body.appearance !== "object" || body.appearance === null) {
      return NextResponse.json({ error: "appearance must be an object" }, { status: 400 });
    }
    patch.appearance = body.appearance;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection("users").where("snail.id", "==", id).limit(1).get();
    if (snap.empty) {
      return NextResponse.json({ error: "Snail not found" }, { status: 404 });
    }

    const userDoc = snap.docs[0];
    const ownerUid = userDoc.id;
    const snail = userDoc.get("snail") as Record<string, unknown> | undefined;
    if (!snail || typeof snail !== "object") {
      return NextResponse.json({ error: "Invalid snail data" }, { status: 500 });
    }

    const nextSnail = { ...snail, ...patch };

    await db.collection("users").doc(ownerUid).set({ snail: nextSnail }, { merge: true });
    await mirrorSnailToPublicProfile(db, ownerUid, id, nextSnail);

    return NextResponse.json({
      id,
      ownerUid,
      ...serializeDoc(nextSnail),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update snail" },
      { status: 500 },
    );
  }
}

async function mirrorSnailToPublicProfile(
  db: Firestore,
  ownerUid: string,
  snailDocId: string,
  nextSnail: Record<string, unknown>,
) {
  const pubRef = db.collection("publicProfiles").doc(ownerUid);
  const pubSnap = await pubRef.get();
  if (!pubSnap.exists) return;

  const snail = pubSnap.get("snail") as Record<string, unknown> | undefined;
  const sid = snail?.id as string | undefined;
  if (sid !== snailDocId) return;

  await pubRef.set(
    {
      snail: nextSnail,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
