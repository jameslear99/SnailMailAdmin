import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function deriveKey(): Buffer {
  const secret = process.env.LOB_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error(
      "LOB_CREDENTIALS_ENCRYPTION_KEY is not set — required to store Lob API keys in Firestore",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function credentialsEncryptionAvailable(): boolean {
  return Boolean(process.env.LOB_CREDENTIALS_ENCRYPTION_KEY?.trim());
}

/** Encrypt a Lob API key for storage. Returns base64(iv + tag + ciphertext). */
export function encryptCredential(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a value produced by [encryptCredential]. */
export function decryptCredential(blob: string): string {
  const key = deriveKey();
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
