import "server-only";

import { getAdminBucket } from "@/lib/firebase-admin";
import {
  firebaseStorageDownloadUrl,
  newFirebaseStorageDownloadToken,
} from "@/lib/firebase-storage-url";

/** Lob inline `file` HTML limit (@see Lob letters API). */
export const LOB_INLINE_HTML_MAX_CHARS = 10_000;

export type LobLetterFileRef = {
  /** Value for Lob `file` — inline HTML or a public HTTPS URL. */
  file: string;
  inline: boolean;
  htmlStoragePath?: string;
  htmlStorageUrl?: string;
  htmlCharCount: number;
};

/**
 * Lob accepts inline HTML up to 10k chars; larger bodies must be a remote URL.
 * Uploads to Storage and returns a tokenized download URL Lob can fetch.
 */
export async function resolveLobLetterFile(
  html: string,
  jobId: string,
): Promise<LobLetterFileRef> {
  const htmlCharCount = html.length;
  if (htmlCharCount <= LOB_INLINE_HTML_MAX_CHARS) {
    return { file: html, inline: true, htmlCharCount };
  }

  const bucket = getAdminBucket();
  const storagePath = `lob-letter-html/${jobId}.html`;
  const downloadToken = newFirebaseStorageDownloadToken();

  await bucket.file(storagePath).save(Buffer.from(html, "utf8"), {
    metadata: {
      contentType: "text/html; charset=utf-8",
      cacheControl: "private, max-age=86400",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  });

  const htmlStorageUrl = firebaseStorageDownloadUrl(
    bucket.name,
    storagePath,
    downloadToken,
  );

  return {
    file: htmlStorageUrl,
    inline: false,
    htmlStoragePath: storagePath,
    htmlStorageUrl,
    htmlCharCount,
  };
}
