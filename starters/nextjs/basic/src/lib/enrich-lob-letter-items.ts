import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import type { PrintQueueItem } from "@/lib/print-fulfillment";
import {
  findExistingSnailPreviewUrl,
  resolveSnailPreviewUrl,
  type SnailPreviewSize,
} from "@/lib/render-snail-preview-server";
import { serializeDoc } from "@/lib/serialize-firestore";

export type EnrichedPrintQueueItem = PrintQueueItem & {
  senderUsername?: string;
  senderSnailImageUrl?: string;
};

export type LobLetterEnrichment = {
  items: EnrichedPrintQueueItem[];
  recipientSnailImageUrl?: string;
};

async function resolveSnailPreviewUrlWithFallbacks(
  db: Firestore,
  uid: string,
  preferredSize: SnailPreviewSize,
): Promise<string | null> {
  const trimmed = uid.trim();
  if (!trimmed) return null;

  const sizes: SnailPreviewSize[] =
    preferredSize === "hero" ? ["hero", "badge"] : [preferredSize];

  for (const size of sizes) {
    try {
      const url = await resolveSnailPreviewUrl(db, trimmed, size);
      if (url) return url;
    } catch (e) {
      console.error(`[lob-enrich] snail preview render failed for ${trimmed} (${size})`, e);
    }

    try {
      const cached = await findExistingSnailPreviewUrl(trimmed, size);
      if (cached) return cached;
    } catch (e) {
      console.error(`[lob-enrich] snail preview cache lookup failed for ${trimmed} (${size})`, e);
    }
  }

  return null;
}

async function loadUsername(db: Firestore, uid: string): Promise<string | undefined> {
  const pub = await db.collection("publicProfiles").doc(uid).get();
  if (pub.exists) {
    const data = serializeDoc(pub.data())!;
    const username = typeof data.username === "string" ? data.username.trim() : "";
    if (username) return username;
    const displayName = typeof data.displayName === "string" ? data.displayName.trim() : "";
    if (displayName) return displayName;
  }

  const user = await db.collection("users").doc(uid).get();
  if (user.exists) {
    const data = serializeDoc(user.data())!;
    const username = typeof data.username === "string" ? data.username.trim() : "";
    if (username) return username;
    const displayName = typeof data.displayName === "string" ? data.displayName.trim() : "";
    if (displayName) return displayName;
  }

  return undefined;
}

function senderUidFromItem(item: PrintQueueItem): string {
  const post = item.mailPost;
  if (!post) return "";
  const uid = post.senderUserId ?? post.senderId;
  return typeof uid === "string" ? uid.trim() : "";
}

export async function enrichItemsForLobLetter(
  db: Firestore,
  items: PrintQueueItem[],
  recipientUid: string,
): Promise<LobLetterEnrichment> {
  const senderUids = new Set<string>();
  for (const item of items) {
    const uid = senderUidFromItem(item);
    if (uid) senderUids.add(uid);
  }

  const usernameByUid = new Map<string, string>();
  const snailBadgeByUid = new Map<string, string>();

  for (const uid of senderUids) {
    const [username, snailUrl] = await Promise.all([
      loadUsername(db, uid),
      resolveSnailPreviewUrlWithFallbacks(db, uid, "badge"),
    ]);
    if (username) usernameByUid.set(uid, username);
    if (snailUrl) snailBadgeByUid.set(uid, snailUrl);
  }

  const recipientSnailImageUrl =
    (await resolveSnailPreviewUrlWithFallbacks(db, recipientUid.trim(), "hero")) ?? undefined;

  const enriched: EnrichedPrintQueueItem[] = items.map((item) => {
    const senderUid = senderUidFromItem(item);
    const post = item.mailPost;
    const storedAsset =
      post && typeof post.senderSnailAssetUrl === "string" ? post.senderSnailAssetUrl.trim() : "";

    const renderedSnail = senderUid ? snailBadgeByUid.get(senderUid) : undefined;

    return {
      ...item,
      senderUsername:
        (senderUid ? usernameByUid.get(senderUid) : undefined) ??
        (post && typeof post.senderSnailName === "string" ? post.senderSnailName.trim() : undefined),
      senderSnailImageUrl: renderedSnail ?? (storedAsset || undefined),
    };
  });

  return { items: enriched, recipientSnailImageUrl };
}
