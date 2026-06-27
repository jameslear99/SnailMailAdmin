import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminApp, getAdminDb } from "@/lib/firebase-admin";
import type { AdminAuthed } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

const COLLECTION = "adminUsers";

export type AdminUserRecord = {
  uid: string;
  email: string;
  createdAt: string | null;
  createdByUid: string | null;
  createdByEmail: string | null;
};

function toAdminUserRecord(id: string, data: Record<string, unknown>): AdminUserRecord {
  return {
    uid: id,
    email: String(data.email ?? ""),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    createdByUid: (data.createdByUid as string | undefined) ?? null,
    createdByEmail: (data.createdByEmail as string | undefined) ?? null,
  };
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  const snap = await getAdminDb().collection(COLLECTION).orderBy("email").get();
  return snap.docs.map((doc) => toAdminUserRecord(doc.id, serializeDoc(doc.data()) ?? {}));
}

/** List admins; index the viewer once if they have admin claim but no roster row (CLI bootstrap). */
export async function listAdminUsersForViewer(viewerUid: string): Promise<AdminUserRecord[]> {
  let admins = await listAdminUsers();
  if (!admins.some((a) => a.uid === viewerUid)) {
    await indexAdminUserIfNeeded(viewerUid);
    admins = await listAdminUsers();
  }
  return admins;
}

export async function createAdminUser(params: {
  email: string;
  password: string;
  createdBy: AdminAuthed;
}): Promise<AdminUserRecord> {
  const email = params.email.trim().toLowerCase();
  const { password } = params;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address.");
  }
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const auth = getAdminApp().auth();
  const db = getAdminDb();

  let uid: string;

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code !== "auth/user-not-found") throw e;
    uid = (await auth.createUser({ email, password })).uid;
  }

  await auth.setCustomUserClaims(uid, { admin: true });

  const ref = db.collection(COLLECTION).doc(uid);
  const existing = await ref.get();
  await ref.set(
    {
      email,
      updatedAt: FieldValue.serverTimestamp(),
      createdByUid: params.createdBy.uid,
      createdByEmail: params.createdBy.email ?? null,
      ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  return {
    uid,
    email,
    createdAt: null,
    createdByUid: params.createdBy.uid,
    createdByEmail: params.createdBy.email,
  };
}

export async function revokeAdminUser(params: {
  uid: string;
  revokedBy: AdminAuthed;
}): Promise<void> {
  if (params.uid === params.revokedBy.uid) {
    throw new Error("You cannot remove your own admin access.");
  }

  const auth = getAdminApp().auth();
  const user = await auth.getUser(params.uid);
  const claims = { ...(user.customClaims ?? {}) };
  delete claims.admin;
  await auth.setCustomUserClaims(params.uid, claims);
  await getAdminDb().collection(COLLECTION).doc(params.uid).delete();
}

async function indexAdminUserIfNeeded(uid: string): Promise<void> {
  const db = getAdminDb();
  const existing = await db.collection(COLLECTION).doc(uid).get();
  if (existing.exists) return;

  const user = await getAdminApp().auth().getUser(uid);
  if (user.customClaims?.admin !== true) return;

  await db.collection(COLLECTION).doc(uid).set(
    {
      email: (user.email ?? "").toLowerCase(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdByUid: null,
      createdByEmail: null,
    },
    { merge: true },
  );
}
