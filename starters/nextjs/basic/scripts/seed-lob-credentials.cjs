/**
 * One-time: encrypt and store Lob API keys in Firestore adminSecrets/lobApiCredentials.
 *
 * Usage (keys via env — not echoed):
 *   LOB_API_KEY_TEST=test_xxx LOB_PUBLISHABLE_KEY_TEST=test_pub_xxx node scripts/seed-lob-credentials.cjs
 *
 * Requires LOB_CREDENTIALS_ENCRYPTION_KEY in Admin/.env.local
 */

const { createCipheriv, createHash, randomBytes } = require("crypto");

const { admin, initAdmin } = require("./firebase-admin-init.cjs");

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DOC_PATH = "adminSecrets/lobApiCredentials";

function deriveKey() {
  const secret = process.env.LOB_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!secret) {
    console.error("LOB_CREDENTIALS_ENCRYPTION_KEY is not set in Admin/.env.local");
    process.exit(1);
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encryptCredential(plaintext) {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

function trimEnv(name) {
  return process.env[name]?.trim() || "";
}

initAdmin();
const db = admin.firestore();

const testSecret = trimEnv("LOB_API_KEY_TEST");
const testPub = trimEnv("LOB_PUBLISHABLE_KEY_TEST");
const liveSecret = trimEnv("LOB_API_KEY_LIVE");
const livePub = trimEnv("LOB_PUBLISHABLE_KEY_LIVE");

if (!testSecret && !testPub && !liveSecret && !livePub) {
  console.error(
    "No keys provided. Set LOB_API_KEY_TEST and/or LOB_PUBLISHABLE_KEY_TEST (and live variants if needed).",
  );
  process.exit(1);
}

(async () => {
  const patch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: "seed-lob-credentials-script",
  };

  if (testSecret) patch.testSecretKeyEnc = encryptCredential(testSecret);
  if (testPub) patch.testPublishableKeyEnc = encryptCredential(testPub);
  if (liveSecret) patch.liveSecretKeyEnc = encryptCredential(liveSecret);
  if (livePub) patch.livePublishableKeyEnc = encryptCredential(livePub);

  await db.doc(DOC_PATH).set(patch, { merge: true });

  console.log(`Saved Lob credentials to ${DOC_PATH}`);
  if (testSecret) console.log("  test secret key: yes");
  if (testPub) console.log("  test publishable key: yes");
  if (liveSecret) console.log("  live secret key: yes");
  if (livePub) console.log("  live publishable key: yes");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
