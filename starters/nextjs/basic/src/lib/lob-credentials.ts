import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import {
  credentialsEncryptionAvailable,
  decryptCredential,
  encryptCredential,
} from "@/lib/lob-credentials-crypto";
import type {
  LobCredentialKeyStatus,
  LobCredentialsPublicView,
  LobCredentialsUpdateBody,
} from "@/lib/lob-credentials-types";

export type { LobCredentialsPublicView, LobCredentialsUpdateBody } from "@/lib/lob-credentials-types";

type StoredCredentials = {
  testSecretKeyEnc?: string;
  testPublishableKeyEnc?: string;
  liveSecretKeyEnc?: string;
  livePublishableKeyEnc?: string;
};

export type LobEnvironment = "test" | "live";

/** Firestore `adminSecrets/lobApiCredentials` — client access denied in rules. */
export const LOB_CREDENTIALS_DOC = "adminSecrets/lobApiCredentials" as const;

type LobCredentialField = "secretKey" | "publishableKey";

function envSecretKey(environment: LobEnvironment): string {
  if (environment === "live") {
    return process.env.LOB_API_KEY_LIVE?.trim() || process.env.LOB_API_KEY?.trim() || "";
  }
  return process.env.LOB_API_KEY_TEST?.trim() || process.env.LOB_API_KEY?.trim() || "";
}

function envPublishableKey(environment: LobEnvironment): string {
  if (environment === "live") {
    return process.env.LOB_PUBLISHABLE_KEY_LIVE?.trim() || process.env.LOB_PUBLISHABLE_KEY?.trim() || "";
  }
  return process.env.LOB_PUBLISHABLE_KEY_TEST?.trim() || process.env.LOB_PUBLISHABLE_KEY?.trim() || "";
}

/** Mask a key for admin UI — never return full secret to the browser. */
export function maskApiKey(key: string): string {
  const t = key.trim();
  if (t.length <= 12) return "••••••••";
  return `${t.slice(0, 8)}…${t.slice(-4)}`;
}

function storedFieldName(environment: LobEnvironment, field: LobCredentialField): keyof StoredCredentials {
  const prefix = environment === "live" ? "live" : "test";
  return field === "secretKey"
    ? (`${prefix}SecretKeyEnc` as keyof StoredCredentials)
    : (`${prefix}PublishableKeyEnc` as keyof StoredCredentials);
}

function readStored(stored: StoredCredentials, environment: LobEnvironment, field: LobCredentialField): string {
  const enc = stored[storedFieldName(environment, field)];
  if (!enc || typeof enc !== "string") return "";
  if (!credentialsEncryptionAvailable()) return "";
  try {
    return decryptCredential(enc);
  } catch {
    return "";
  }
}

function keyStatus(
  firestoreEnc: string | undefined,
  firestoreValue: string,
  envValue: string,
): LobCredentialKeyStatus {
  if (firestoreEnc) {
    if (firestoreValue) {
      return { configured: true, masked: maskApiKey(firestoreValue), source: "firestore" };
    }
    return { configured: true, masked: "encrypted (decrypt failed)", source: "firestore" };
  }
  if (envValue) {
    return { configured: true, masked: maskApiKey(envValue), source: "env" };
  }
  return { configured: false, source: "none" };
}

function collectionAndDoc(): { collection: string; id: string } {
  const [collection, id] = LOB_CREDENTIALS_DOC.split("/");
  return { collection, id };
}

export async function loadStoredCredentials(db: Firestore): Promise<StoredCredentials> {
  const { collection, id } = collectionAndDoc();
  const snap = await db.collection(collection).doc(id).get();
  return (snap.data() ?? {}) as StoredCredentials;
}

export async function getLobCredentialsPublicView(db: Firestore): Promise<LobCredentialsPublicView> {
  const stored = await loadStoredCredentials(db);

  const testSecretFs = readStored(stored, "test", "secretKey");
  const testPubFs = readStored(stored, "test", "publishableKey");
  const liveSecretFs = readStored(stored, "live", "secretKey");
  const livePubFs = readStored(stored, "live", "publishableKey");

  return {
    test: {
      secretKey: keyStatus(stored.testSecretKeyEnc, testSecretFs, envSecretKey("test")),
      publishableKey: keyStatus(stored.testPublishableKeyEnc, testPubFs, envPublishableKey("test")),
    },
    live: {
      secretKey: keyStatus(stored.liveSecretKeyEnc, liveSecretFs, envSecretKey("live")),
      publishableKey: keyStatus(stored.livePublishableKeyEnc, livePubFs, envPublishableKey("live")),
    },
    storageReady: credentialsEncryptionAvailable(),
    firestorePath: LOB_CREDENTIALS_DOC,
  };
}

/** Resolve secret key for Lob API calls — Firestore (encrypted) first, then env fallback. */
export async function resolveLobSecretKey(db: Firestore, environment: LobEnvironment): Promise<string> {
  const stored = await loadStoredCredentials(db);
  const fromStore = readStored(stored, environment, "secretKey");
  if (fromStore) return fromStore;
  return envSecretKey(environment);
}

export async function resolveLobPublishableKey(
  db: Firestore,
  environment: LobEnvironment,
): Promise<string> {
  const stored = await loadStoredCredentials(db);
  const fromStore = readStored(stored, environment, "publishableKey");
  if (fromStore) return fromStore;
  return envPublishableKey(environment);
}

export async function lobSecretConfigured(db: Firestore, environment: LobEnvironment): Promise<boolean> {
  const key = await resolveLobSecretKey(db, environment);
  return key.length > 0;
}

/** Explains why encrypted Firestore Lob keys cannot be used in this runtime. */
export async function lobSecretMisconfigurationReason(
  db: Firestore,
  environment: LobEnvironment,
): Promise<string | null> {
  if (await lobSecretConfigured(db, environment)) return null;

  const stored = await loadStoredCredentials(db);
  const enc = stored[storedFieldName(environment, "secretKey")];
  if (typeof enc === "string" && enc.trim()) {
    if (!credentialsEncryptionAvailable()) {
      return `Lob ${environment} API key is stored encrypted in Firestore, but LOB_CREDENTIALS_ENCRYPTION_KEY is not set on this server. Add the same encryption key to App Hosting secrets, or set LOB_API_KEY_${environment === "live" ? "LIVE" : "TEST"} in the hosting environment.`;
    }
    return `Lob ${environment} API key is stored encrypted in Firestore but could not be decrypted. Ensure LOB_CREDENTIALS_ENCRYPTION_KEY on this server matches the value used when the key was saved in Admin settings.`;
  }

  return `LOB API key not configured for ${environment} mode. Add keys in Printing → Settings → Lob credentials.`;
}

function trimOrUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export async function updateLobCredentials(
  db: Firestore,
  body: LobCredentialsUpdateBody,
  updatedByUid: string,
): Promise<LobCredentialsPublicView> {
  if (!credentialsEncryptionAvailable()) {
    throw new Error(
      "Set LOB_CREDENTIALS_ENCRYPTION_KEY in Admin .env.local before saving API keys to Firestore",
    );
  }

  const { collection, id } = collectionAndDoc();
  const ref = db.collection(collection).doc(id);
  const existing = ((await ref.get()).data() ?? {}) as StoredCredentials;
  const patch: StoredCredentials & { updatedByUid: string } = { ...existing, updatedByUid };

  if (body.clearTest) {
    delete patch.testSecretKeyEnc;
    delete patch.testPublishableKeyEnc;
  }
  if (body.clearLive) {
    delete patch.liveSecretKeyEnc;
    delete patch.livePublishableKeyEnc;
  }

  const testSecret = trimOrUndef(body.testSecretKey);
  const testPub = trimOrUndef(body.testPublishableKey);
  const liveSecret = trimOrUndef(body.liveSecretKey);
  const livePub = trimOrUndef(body.livePublishableKey);

  if (testSecret) patch.testSecretKeyEnc = encryptCredential(testSecret);
  if (testPub) patch.testPublishableKeyEnc = encryptCredential(testPub);
  if (liveSecret) patch.liveSecretKeyEnc = encryptCredential(liveSecret);
  if (livePub) patch.livePublishableKeyEnc = encryptCredential(livePub);

  const { FieldValue } = await import("firebase-admin/firestore");
  await ref.set(
    {
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return getLobCredentialsPublicView(db);
}
