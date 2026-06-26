import { randomUUID } from "crypto";

/** Token stored in object metadata as `firebaseStorageDownloadTokens`. */
export function newFirebaseStorageDownloadToken(): string {
  return randomUUID();
}

/**
 * Download URL for objects uploaded via Admin SDK with a Firebase download token.
 * Works with uniform bucket-level access (no per-object ACL / makePublic).
 */
export function firebaseStorageDownloadUrl(
  bucketName: string,
  objectPath: string,
  downloadToken: string,
): string {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${downloadToken}`;
}
