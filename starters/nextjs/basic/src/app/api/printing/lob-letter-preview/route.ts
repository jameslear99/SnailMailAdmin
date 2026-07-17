import { NextResponse } from "next/server";

import { buildLobLetterHtmlFromSlots } from "@/lib/build-lob-letter-html";
import { getAdminDb } from "@/lib/firebase-admin";
import { parseLobLetterFormat } from "@/lib/lob-letter-format";
import { parseLobFulfillmentSettings } from "@/lib/lob-fulfillment-settings";
import {
  parseLobLetterLayout,
  SAMPLE_LOB_LETTER_POSTS,
  type LobLetterPostSlot,
} from "@/lib/lob-letter-template";
import { loadProfileForSnailPreview } from "@/lib/load-snail-profile-for-preview";
import { parseSnailLookFromProfile } from "@/lib/parse-snail-look";
import { resolveSnailImageForLob } from "@/lib/resolve-snail-image-for-lob";
import { requireAdminApi } from "@/lib/require-admin-api";

type PreviewBody = {
  letterFormat?: unknown;
  letterLayout?: unknown;
  doubleSided?: boolean;
  previewMode?: boolean;
  recipientUid?: string;
  useRealRecipientSnail?: boolean;
  posts?: LobLetterPostSlot[];
};

export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as PreviewBody;
    const letterFormat = parseLobLetterFormat(body.letterFormat);
    const letterLayout = parseLobLetterLayout(body.letterLayout);
    const doubleSided = body.doubleSided !== false;
    const posts =
      Array.isArray(body.posts) && body.posts.length > 0 ? body.posts : SAMPLE_LOB_LETTER_POSTS;

    let recipientSnailImageUrl: string | undefined;
    let recipientSnailStatus = "not_requested" as
      | "not_requested"
      | "missing_uid"
      | "missing_look"
      | "resolved"
      | "unavailable";

    const recipientUid = typeof body.recipientUid === "string" ? body.recipientUid.trim() : "";
    const tryRealSnail = body.useRealRecipientSnail === true && letterFormat.showRecipientSnailOnCover;

    if (tryRealSnail) {
      if (!recipientUid) {
        recipientSnailStatus = "missing_uid";
      } else {
        const db = getAdminDb();
        const profile = await loadProfileForSnailPreview(db, recipientUid);
        const look = parseSnailLookFromProfile(profile);
        if (!look) {
          recipientSnailStatus = "missing_look";
        } else {
          const resolved = await resolveSnailImageForLob(db, recipientUid, "hero");
          if (resolved) {
            recipientSnailImageUrl = resolved;
            recipientSnailStatus = "resolved";
          } else {
            recipientSnailStatus = "unavailable";
          }
        }
      }
    }

    const html = buildLobLetterHtmlFromSlots(posts, {
      thankYouMessage: letterFormat.thankYouMessage,
      showRecipientSnailOnCover: letterFormat.showRecipientSnailOnCover,
      recipientSnailImageUrl,
      doubleSided,
      layout: letterLayout,
      previewMode: true,
    });

    return NextResponse.json({
      html,
      pageCount: (html.match(/class="sheet /g) ?? []).length,
      recipientSnailStatus,
      recipientSnailResolved: recipientSnailStatus === "resolved",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob-letter-preview failed" },
      { status: 500 },
    );
  }
}

/** Load saved settings as defaults for the editor. */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const snap = await db.collection("adminSettings").doc("lobFulfillment").get();
    const settings = parseLobFulfillmentSettings(snap.data() ?? undefined);
    return NextResponse.json({ settings });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "lob-letter-preview GET failed" },
      { status: 500 },
    );
  }
}
