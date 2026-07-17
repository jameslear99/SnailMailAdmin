/**
 * Re-encrypt Lob API keys in Firestore when LOB_CREDENTIALS_ENCRYPTION_KEY changes.
 *
 * Usage:
 *   OLD_LOB_CREDENTIALS_ENCRYPTION_KEY='...' \
 *   LOB_CREDENTIALS_ENCRYPTION_KEY='superbigmegacheese' \
 *   node scripts/reencrypt-lob-credentials.cjs
 *
 * If OLD_* is omitted, decrypts using LOB_CREDENTIALS_ENCRYPTION_KEY from .env.local.
 */

const { createCipheriv, createDecipheriv, createHash, randomBytes } = require("crypto");

const { admin, initAdmin } = require("./firebase-admin-init.cjs");

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DOC_PATH = "adminSecrets/lobApiCredentials";

const FIELDS = [
  "testSecretKeyEnc",
  "testPublishableKeyEnc",
  "liveSecretKeyEnc",
  "livePublishableKeyEnc",
];

function keyFromSecret(secret) {
  return createHash("sha256").update(secret, "utf8").digest();
}

function decryptWithSecret(blob, secret) {
  const key = keyFromSecret(secret);
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Invalid encrypted credential blob");
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function encryptWithSecret(plaintext, secret) {
  const key = keyFromSecret(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

initAdmin();
const db = admin.firestore();

const oldSecret =
  process.env.OLD_LOB_CREDENTIALS_ENCRYPTION_KEY?.trim() ||
  process.env.LOB_CREDENTIALS_ENCRYPTION_KEY?.trim();
const newSecret = process.env.NEW_LOB_CREDENTIALS_ENCRYPTION_KEY?.trim();

if (!oldSecret) {
  console.error("Missing OLD_LOB_CREDENTIALS_ENCRYPTION_KEY or LOB_CREDENTIALS_ENCRYPTION_KEY");
  process.exit(1);
}
if (!newSecret) {
  console.error("Set NEW_LOB_CREDENTIALS_ENCRYPTION_KEY to the production encryption passphrase");
  process.exit(1);
}
if (oldSecret === newSecret) {
  console.error("Old and new encryption keys are identical — nothing to do");
  process.exit(1);
}

(async () => {
  const snap = await db.doc(DOC_PATH).get();
  if (!snap.exists) {
    console.error(`No document at ${DOC_PATH}`);
    process.exit(1);
  }

  const data = snap.data() ?? {};
  const patch = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedByUid: "reencrypt-lob-credentials-script",
  };
  let reencrypted = 0;

  for (const field of FIELDS) {
    const enc = data[field];
    if (typeof enc !== "string" || !enc.trim()) continue;
    const plaintext = decryptWithSecret(enc, oldSecret);
    patch[field] = encryptWithSecret(plaintext, newSecret);
    reencrypted += 1;
    console.log(`  re-encrypted ${field}`);
  }

  if (reencrypted === 0) {
    console.error("No encrypted Lob key fields found to re-encrypt");
    process.exit(1);
  }

  await db.doc(DOC_PATH).set(patch, { merge: true });
  console.log(`Re-encrypted ${reencrypted} field(s) in ${DOC_PATH}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
