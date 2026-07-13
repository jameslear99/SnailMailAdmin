import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  getLobCredentialsPublicView,
  type LobCredentialsUpdateBody,
  updateLobCredentials,
} from "@/lib/lob-credentials";
import { requireAdminApi } from "@/lib/require-admin-api";

/** Masked Lob API key status — never returns full secrets. */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const credentials = await getLobCredentialsPublicView(db);
    return NextResponse.json({ credentials });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob-credentials GET failed" },
      { status: 500 },
    );
  }
}

/** Save Lob API keys (encrypted at rest). Empty fields leave existing values unchanged. */
export async function PUT(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as LobCredentialsUpdateBody;
    const db = getAdminDb();
    const credentials = await updateLobCredentials(db, body, auth.uid);
    return NextResponse.json({ credentials });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob-credentials PUT failed" },
      { status: 400 },
    );
  }
}
