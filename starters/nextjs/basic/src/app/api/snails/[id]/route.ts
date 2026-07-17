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

type SnailLookPatch = {
  antennaAssetId?: string;
  bodyAssetId?: string;
  shellAssetId?: string;
  faceAssetId?: string;
  accessoryAssetId?: string | null;
  antennaColor?: number;
  bodyColor?: number;
  shellColor?: number;
};

type PatchBody = {
  name?: string;
  hometown?: string;
  backstory?: string;
  look?: SnailLookPatch;
  level?: number;
  xp?: number;
  appearance?: Record<string, unknown>;
};

function isValidFlutterColor(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && (n >>> 0) <= 0xffffffff;
}

function normalizeFlutterColor(n: number): number {
  return n >>> 0;
}

function validateLookPatch(look: SnailLookPatch): string | null {
  const requiredIds = ["antennaAssetId", "bodyAssetId", "shellAssetId", "faceAssetId"] as const;
  for (const key of requiredIds) {
    const value = look[key];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      return `${key} must be a non-empty string`;
    }
  }
  if (
    look.accessoryAssetId !== undefined &&
    look.accessoryAssetId !== null &&
    (typeof look.accessoryAssetId !== "string" || !look.accessoryAssetId.trim())
  ) {
    return "accessoryAssetId must be a non-empty string or null";
  }
  for (const key of ["antennaColor", "bodyColor", "shellColor"] as const) {
    const value = look[key];
    if (value !== undefined && !isValidFlutterColor(value)) {
      return `${key} must be a valid Flutter ARGB color integer`;
    }
  }
  return null;
}

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
  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (body.hometown !== undefined) {
    if (typeof body.hometown !== "string") {
      return NextResponse.json({ error: "hometown must be a string" }, { status: 400 });
    }
    patch.hometown = body.hometown.trim();
  }
  if (body.backstory !== undefined) {
    if (typeof body.backstory !== "string") {
      return NextResponse.json({ error: "backstory must be a string" }, { status: 400 });
    }
    patch.backstory = body.backstory.trim();
  }
  if (body.look !== undefined) {
    if (typeof body.look !== "object" || body.look === null) {
      return NextResponse.json({ error: "look must be an object" }, { status: 400 });
    }
    const lookError = validateLookPatch(body.look);
    if (lookError) {
      return NextResponse.json({ error: lookError }, { status: 400 });
    }
    patch.look = body.look;
  }
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
    if (body.look !== undefined) {
      const existingLook =
        snail.look && typeof snail.look === "object" && !Array.isArray(snail.look)
          ? (snail.look as Record<string, unknown>)
          : {};
      const mergedLook: Record<string, unknown> = { ...existingLook, ...body.look };
      if (body.look.accessoryAssetId === null || body.look.accessoryAssetId === "") {
        delete mergedLook.accessoryAssetId;
      }
      for (const key of ["antennaColor", "bodyColor", "shellColor"] as const) {
        const value = mergedLook[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          mergedLook[key] = normalizeFlutterColor(value);
        }
      }
      nextSnail.look = mergedLook;
    }

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
