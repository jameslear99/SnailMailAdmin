import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  type LobFulfillmentSettings,
  parseLobFulfillmentSettings,
  validateLobFulfillmentSettings,
} from "@/lib/lob-fulfillment-settings";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

const DOC_PATH = "adminSettings/lobFulfillment" as const;

function collectionAndDoc(): { collection: string; id: string } {
  const [collection, id] = DOC_PATH.split("/");
  return { collection, id };
}

export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const { collection, id } = collectionAndDoc();
    const snap = await db.collection(collection).doc(id).get();
    const settings = parseLobFulfillmentSettings(serializeDoc(snap.data() ?? undefined) ?? undefined);
    const lastAutoRunAt =
      typeof snap.data()?.lastAutoRunAt === "object" && snap.data()?.lastAutoRunAt
        ? serializeDoc(snap.data() ?? undefined)?.lastAutoRunAt
        : undefined;

    return NextResponse.json({
      settings,
      lastAutoRunAt: typeof lastAutoRunAt === "string" ? lastAutoRunAt : undefined,
      firestorePath: DOC_PATH,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob-settings GET failed" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const json = (await req.json()) as Partial<LobFulfillmentSettings>;
    const settings = parseLobFulfillmentSettings(json as Record<string, unknown>);
    const err = validateLobFulfillmentSettings(settings);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const db = getAdminDb();
    const { collection, id } = collectionAndDoc();
    await db.collection(collection).doc(id).set(
      {
        ...settings,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return NextResponse.json({ settings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob-settings PUT failed" },
      { status: 500 },
    );
  }
}
