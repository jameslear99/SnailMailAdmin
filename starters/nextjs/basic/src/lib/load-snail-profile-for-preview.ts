import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { parseSnailLookFromProfile } from "@/lib/parse-snail-look";
import { serializeDoc } from "@/lib/serialize-firestore";

/** Load the profile row used to composite a user's current snail look. */
export async function loadProfileForSnailPreview(
  db: Firestore,
  uid: string,
): Promise<Record<string, unknown> | null> {
  const [pubSnap, userSnap] = await Promise.all([
    db.collection("publicProfiles").doc(uid).get(),
    db.collection("users").doc(uid).get(),
  ]);

  const pubData = pubSnap.exists ? serializeDoc(pubSnap.data())! : null;
  const userData = userSnap.exists ? serializeDoc(userSnap.data())! : null;

  // Canonical snail customization lives on users/{uid}; publicProfiles is a mirror.
  const userSnail =
    userData?.snail && typeof userData.snail === "object" && !Array.isArray(userData.snail)
      ? userData.snail
      : null;

  if (userSnail) {
    return {
      ...(pubData ?? {}),
      ...(userData ?? {}),
      uid,
      snail: userSnail,
    };
  }

  if (pubData && parseSnailLookFromProfile(pubData)) {
    return pubData;
  }

  return userData ?? pubData;
}
