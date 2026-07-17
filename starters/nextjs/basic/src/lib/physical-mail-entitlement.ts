import { FieldValue, type Firestore, Timestamp } from "firebase-admin/firestore";

export type PhysicalMailEntitlementOverride = {
  active: boolean;
  reason?: string;
  grantedBy?: string;
  grantedAt?: Timestamp;
  source?: "admin";
};

export type SnailmailSubscription = {
  active: boolean;
  expiresAt?: Timestamp;
  platform?: string;
  updatedAt?: Timestamp;
  source?: "revenuecat_webhook" | "admin";
};

/** Effective physical-mail entitlement for a recipient. */
export function resolveReceivesPhysicalMail(
  userData: Record<string, unknown> | undefined,
  publicProfileData: Record<string, unknown> | undefined,
): boolean {
  const override = userData?.physicalMailEntitlementOverride as
    | PhysicalMailEntitlementOverride
    | undefined;
  if (override != null && typeof override.active === "boolean") {
    return override.active;
  }

  const subscription = userData?.snailmailSubscription as
    | SnailmailSubscription
    | undefined;
  if (subscription != null && typeof subscription.active === "boolean") {
    return subscription.active;
  }

  return publicProfileData?.receivesPhysicalMail === true;
}

export async function loadReceivesPhysicalMail(
  db: Firestore,
  uid: string,
): Promise<boolean> {
  const [userSnap, publicSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("publicProfiles").doc(uid).get(),
  ]);
  return resolveReceivesPhysicalMail(
    userSnap.data(),
    publicSnap.data(),
  );
}

const RETROACTIVE_FLIP_DAYS = 7;

/**
 * When granting physical mail, flip recent `digital_only` deliveries to
 * `awaiting_print` so they enter the print queue.
 */
export async function retroactiveFlipDigitalOnlyDeliveries(
  db: Firestore,
  recipientUid: string,
): Promise<number> {
  const cutoff = Timestamp.fromMillis(
    Date.now() - RETROACTIVE_FLIP_DAYS * 24 * 60 * 60 * 1000,
  );

  const snap = await db
    .collectionGroup("deliveries")
    .where("recipientUserId", "==", recipientUid)
    .where("deliveryStatus", "==", "digital_only")
    .where("createdAt", ">=", cutoff)
    .limit(200)
    .get();

  if (snap.empty) return 0;

  const batch = db.batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { deliveryStatus: "awaiting_print" });
  }
  await batch.commit();
  return snap.size;
}

export async function setPhysicalMailEntitlement(
  db: Firestore,
  params: {
    uid: string;
    receivesPhysicalMail: boolean;
    grantedBy: string;
    reason?: string;
  },
): Promise<{ flippedDeliveries: number }> {
  const { uid, receivesPhysicalMail, grantedBy, reason } = params;
  const override: PhysicalMailEntitlementOverride = {
    active: receivesPhysicalMail,
    grantedBy,
    grantedAt: Timestamp.now(),
    source: "admin",
    ...(reason?.trim() ? { reason: reason.trim() } : {}),
  };

  const batch = db.batch();
  batch.set(
    db.collection("users").doc(uid),
    { physicalMailEntitlementOverride: override },
    { merge: true },
  );
  batch.set(
    db.collection("publicProfiles").doc(uid),
    {
      receivesPhysicalMail,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  let flippedDeliveries = 0;
  if (receivesPhysicalMail) {
    flippedDeliveries = await retroactiveFlipDigitalOnlyDeliveries(db, uid);
  }

  return { flippedDeliveries };
}

/** Remove admin override so subscription/public profile flag applies again. */
export async function clearPhysicalMailEntitlementOverride(
  db: Firestore,
  uid: string,
): Promise<void> {
  await db.collection("users").doc(uid).update({
    physicalMailEntitlementOverride: FieldValue.delete(),
  });
}
