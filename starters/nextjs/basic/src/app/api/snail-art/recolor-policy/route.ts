import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";
import {
  DEFAULT_SNAIL_ART_RECOLOR_POLICY,
  parseSnailArtRecolorPolicy,
  type SnailArtRecolorPolicy,
} from "@/lib/snail-art-recolor-policy";

const DOC_PATH = "adminSettings/snailArtRecolorPolicy" as const;

function collectionAndDoc(): { collection: string; id: string } {
  const [collection, id] = DOC_PATH.split("/");
  return { collection, id };
}

function policyToFirestore(policy: SnailArtRecolorPolicy): { categories: SnailArtRecolorPolicy } {
  return { categories: { ...policy, face: false } };
}

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const { collection, id } = collectionAndDoc();
    const snap = await db.collection(collection).doc(id).get();
    const policy = parseSnailArtRecolorPolicy(serializeDoc(snap.data() ?? undefined));
    return NextResponse.json({ policy });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load recolor policy" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const json = (await req.json()) as { policy?: Partial<SnailArtRecolorPolicy> };
    const merged = parseSnailArtRecolorPolicy({
      categories: {
        ...DEFAULT_SNAIL_ART_RECOLOR_POLICY,
        ...json.policy,
        face: false,
      },
    });

    const db = getAdminDb();
    const { collection, id } = collectionAndDoc();
    await db.collection(collection).doc(id).set(
      {
        ...policyToFirestore(merged),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ policy: merged });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save recolor policy" },
      { status: 500 },
    );
  }
}
