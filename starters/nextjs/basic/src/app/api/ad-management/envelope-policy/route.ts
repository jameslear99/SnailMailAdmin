import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { type EnvelopeAdPolicy, type EnvelopeAdTier, parseEnvelopeAdPolicy } from "@/lib/envelope-ad-policy";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

const DOC_PATH = "adminSettings/envelopeAdPolicy" as const;

function collectionAndDoc(): { collection: string; id: string } {
  const [collection, id] = DOC_PATH.split("/");
  return { collection, id };
}

function validatePolicy(body: EnvelopeAdPolicy): string | null {
  if (body.adsPerPostRatio < 0) return "adsPerPostRatio must be >= 0";
  if (body.minAdPages < 0 || body.maxAdPages < 0) return "min/max ad pages must be >= 0";
  if (body.minAdPages > body.maxAdPages) return "minAdPages cannot exceed maxAdPages";
  for (const t of body.tiers) {
    if (t.minPosts > t.maxPosts) return `Tier invalid: minPosts ${t.minPosts} > maxPosts ${t.maxPosts}`;
    if (t.adPages < 0) return "Tier adPages must be >= 0";
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const { collection, id } = collectionAndDoc();
    const snap = await db.collection(collection).doc(id).get();
    const merged = parseEnvelopeAdPolicy(serializeDoc(snap.data() ?? undefined));
    return NextResponse.json({ policy: merged });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "envelope-policy GET failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const json = (await req.json()) as Partial<EnvelopeAdPolicy> & { tiers?: EnvelopeAdTier[] };
    const policy = parseEnvelopeAdPolicy({
      adsPerPostRatio: json.adsPerPostRatio,
      rounding: json.rounding,
      minAdPages: json.minAdPages,
      maxAdPages: json.maxAdPages,
      tiers: json.tiers,
    });
    const err = validatePolicy(policy);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const db = getAdminDb();
    const { collection, id } = collectionAndDoc();
    await db.collection(collection).doc(id).set(
      {
        ...policy,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const merged = { ...policy };
    return NextResponse.json({ policy: merged });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "envelope-policy PUT failed" },
      { status: 500 },
    );
  }
}
