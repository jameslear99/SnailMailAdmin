import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminBucket, getAdminDb } from "@/lib/firebase-admin";
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
    const doc = await db.collection("snailArtAssets").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ id: doc.id, ...serializeDoc(doc.data()) });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      displayName?: string;
      description?: string;
      stackOrder?: number;
      recolorable?: boolean;
      status?: string;
    };

    const db = getAdminDb();
    const ref = db.collection("snailArtAssets").doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof body.displayName === "string" && body.displayName.trim()) {
      updates.displayName = body.displayName.trim();
    }
    if (typeof body.description === "string") {
      updates.description = body.description.trim();
    }
    if (typeof body.stackOrder === "number" && Number.isFinite(body.stackOrder)) {
      updates.stackOrder = body.stackOrder;
    }
    if (typeof body.recolorable === "boolean") {
      updates.recolorable = body.recolorable;
    }
    if (body.status === "draft" || body.status === "published") {
      updates.status = body.status;
    }

    await ref.set(updates, { merge: true });
    const next = await ref.get();
    return NextResponse.json({ id: next.id, ...serializeDoc(next.data()) });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const db = getAdminDb();
    const ref = db.collection("snailArtAssets").doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storagePath = existing.get("storagePath") as string | undefined;
    if (storagePath?.trim()) {
      try {
        await getAdminBucket().file(storagePath).delete({ ignoreNotFound: true });
      } catch (err) {
        console.warn("[snail-art] storage delete:", err);
      }
    }

    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete" },
      { status: 500 },
    );
  }
}
