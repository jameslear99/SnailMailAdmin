import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { serializeDoc } from "@/lib/serialize-firestore";
import {
  compareSnailArtPaintOrder,
  isSnailArtCategory,
  DEFAULT_STACK_ORDER,
} from "@/lib/snail-art-types";

/** List catalog entries for layered snail art (`snailArtAssets`). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category")?.trim();

  try {
    const db = getAdminDb();
    const snap = await db.collection("snailArtAssets").limit(500).get();
    let docs = snap.docs;
    if (category && isSnailArtCategory(category)) {
      docs = docs.filter((d) => d.get("category") === category);
    }
    const assets = docs.map((d) => ({
      id: d.id,
      ...serializeDoc(d.data()),
    })) as { id: string; category?: string; stackOrder?: unknown }[];
    assets.sort(compareSnailArtPaintOrder);
    return NextResponse.json({ assets });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load snail art assets" },
      { status: 500 },
    );
  }
}

/** Optional JSON-only create (metadata + pre-existing URL). Rare; prefer POST /api/snail-art-assets/upload */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      category?: string;
      slug?: string;
      displayName?: string;
      description?: string;
      storagePath?: string;
      storageUrl?: string;
      stackOrder?: number;
      fileFormat?: string;
      recolorable?: boolean;
      status?: string;
    };

    if (!body.category || !isSnailArtCategory(body.category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!body.slug?.trim() || !body.displayName?.trim()) {
      return NextResponse.json({ error: "slug and displayName required" }, { status: 400 });
    }
    if (!body.storagePath?.trim() || !body.storageUrl?.trim()) {
      return NextResponse.json(
        { error: "storagePath and storageUrl required for JSON create" },
        { status: 400 },
      );
    }

    const slug = normalizeSlug(body.slug);

    const db = getAdminDb();
    const dup = await db
      .collection("snailArtAssets")
      .where("category", "==", body.category)
      .where("slug", "==", slug)
      .limit(1)
      .get();
    if (!dup.empty) {
      return NextResponse.json({ error: "slug already exists for this category" }, { status: 409 });
    }

    const docRef = db.collection("snailArtAssets").doc();
    await docRef.set({
      category: body.category,
      slug,
      displayName: body.displayName.trim(),
      description: body.description?.trim() ?? "",
      storagePath: body.storagePath.trim(),
      storageUrl: body.storageUrl.trim(),
      stackOrder:
        typeof body.stackOrder === "number"
          ? body.stackOrder
          : DEFAULT_STACK_ORDER[body.category],
      fileFormat: body.fileFormat ?? "other",
      recolorable: body.recolorable !== false,
      status: body.status === "draft" ? "draft" : "published",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const doc = await docRef.get();
    return NextResponse.json({ id: doc.id, ...serializeDoc(doc.data()) });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create asset" },
      { status: 500 },
    );
  }
}

function normalizeSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) throw new Error("invalid slug");
  return s;
}
