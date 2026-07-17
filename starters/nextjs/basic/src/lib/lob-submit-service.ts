import "server-only";

import { createHash } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import {
  buildLobLetterHtml,
  chunkPostcardsForLobLetters,
  POSTCARDS_PER_LOB_LETTER_MAX,
  type BuildLobLetterHtmlOptions,
} from "@/lib/build-lob-letter-html";
import { buildItemsFromDeliveryIds, buildQueueDetailForRecipient } from "@/lib/build-print-queue-detail";
import { enrichItemsForLobLetter } from "@/lib/enrich-lob-letter-items";
import { returnAddressToLobAddress, userDocToLobAddress } from "@/lib/lob-address";
import { createLobLetter, formatLobSubmitErrorMessage, lobConfigured, type LobApiError } from "@/lib/lob-client";
import { lobSecretMisconfigurationReason } from "@/lib/lob-credentials";
import { resolveLobLetterFile } from "@/lib/upload-lob-letter-html";
import {
  lobLetterSizeForProduct,
  type LobFulfillmentSettings,
} from "@/lib/lob-fulfillment-settings";
import {
  PRINT_JOBS_COLLECTION,
  printJobIdForRecipient,
  printJobResubmitId,
  type PrintJobStatus,
  type PrintJobTrigger,
} from "@/lib/print-job";
import { type DeliveryDocShape } from "@/lib/print-fulfillment";
import { scanAwaitingPrintByRecipient } from "@/lib/printing-delivery-scan";
import { serializeDoc } from "@/lib/serialize-firestore";

/** Lob letters pack many postcards across compact multi-page HTML (cover + 4-up pages). */
export const MAX_POSTCARDS_PER_LETTER = POSTCARDS_PER_LOB_LETTER_MAX;

/** Hard safety cap per API request (settings.batchMaxRecipientsPerRun should stay at or below this). */
export const MAX_RECIPIENTS_PER_SUBMIT = 100;

export type SubmitRecipientResult = {
  recipientUid: string;
  jobId?: string;
  status: "submitted" | "skipped" | "failed";
  reason?: string;
  lobLetterId?: string;
  cardCount?: number;
  toName?: string;
  toCity?: string;
};

export type SubmitBatchResult = {
  submitted: number;
  skipped: number;
  failed: number;
  results: SubmitRecipientResult[];
};

async function loadBusyDeliveryIds(db: Firestore): Promise<Set<string>> {
  const busy = new Set<string>();
  const statuses: PrintJobStatus[] = ["pending", "submitted", "in_production", "mailed"];

  for (const status of statuses) {
    const snap = await db
      .collection(PRINT_JOBS_COLLECTION)
      .where("status", "==", status)
      .limit(2000)
      .get();

    for (const doc of snap.docs) {
      const ids = doc.data().deliveryIds;
      if (!Array.isArray(ids)) continue;
      for (const id of ids) {
        if (typeof id === "string") busy.add(id);
      }
    }
  }

  return busy;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }

  const workers = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function deliveryRefForItem(
  db: Firestore,
  item: { mailPostId: string; deliveryId: string },
) {
  return db.collection("mailPosts").doc(item.mailPostId).collection("deliveries").doc(item.deliveryId);
}

function validateReturnAddress(settings: LobFulfillmentSettings): string | null {
  const fromResult = returnAddressToLobAddress(settings.returnAddress);
  if (!fromResult.ok) return `Return address invalid: ${fromResult.error}`;
  return null;
}

function letterHtmlOptions(
  settings: LobFulfillmentSettings,
  displayName: string,
  recipientSnailImageUrl?: string,
): BuildLobLetterHtmlOptions {
  return {
    recipientName: displayName,
    recipientSnailImageUrl: settings.letterFormat.showRecipientSnailOnCover
      ? recipientSnailImageUrl
      : undefined,
    thankYouMessage: settings.letterFormat.thankYouMessage,
    doubleSided: settings.doubleSided,
  };
}

type FailedJobContext = {
  toName?: string;
  toCity?: string;
  cardCount?: number;
};

/** Persist a failed print job so Admin → Print jobs shows configuration/submit errors. */
async function recordRecipientSubmitFailure(
  db: Firestore,
  settings: LobFulfillmentSettings,
  recipientUid: string,
  trigger: PrintJobTrigger,
  reason: string,
  postCache?: Map<string, Record<string, unknown> | null>,
): Promise<{ jobId: string } & FailedJobContext> {
  const uid = recipientUid.trim();
  let deliveryIds: string[] = [];
  let mailPostIds: string[] = [];
  let cardCount = 0;
  let toName: string | undefined;
  let toCity: string | undefined;
  let displayName: string | undefined;

  try {
    const payload = await buildQueueDetailForRecipient(
      db,
      uid,
      postCache ?? new Map(),
      { scope: "awaiting_print" },
    );
    const eligible = payload.items.filter((item) => (item.deliveryStatus ?? "") === "awaiting_print");
    deliveryIds = eligible.map((i) => i.deliveryId);
    mailPostIds = [...new Set(eligible.map((i) => i.mailPostId))];
    cardCount = eligible.length;
    const toResult = userDocToLobAddress(payload.user);
    if (toResult.ok) {
      toName = toResult.address.name;
      toCity = toResult.address.address_city;
      displayName = toResult.address.name;
    }
  } catch {
    // Still write a failed job even if queue lookup fails.
  }

  const jobId =
    deliveryIds.length > 0
      ? printJobIdForRecipient(uid, deliveryIds)
      : `lob_${uid.slice(0, 40)}_err_${createHash("sha256").update(reason).digest("hex").slice(0, 16)}`;

  const jobRef = db.collection(PRINT_JOBS_COLLECTION).doc(jobId);
  const existing = await jobRef.get();
  const prior = existing.data();
  const priorRetryCount = typeof prior?.retryCount === "number" ? prior.retryCount : 0;
  const retryCount = prior?.status === "failed" ? priorRetryCount + 1 : priorRetryCount;

  await jobRef.set(
    {
      recipientUid: uid,
      recipientDisplayName: displayName ?? null,
      toName: toName ?? null,
      toCity: toCity ?? null,
      toState: null,
      toZip: null,
      productType: settings.productType,
      deliveryIds,
      mailPostIds,
      cardCount,
      status: "failed",
      trigger,
      retryCount,
      errorMessage: reason,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.exists
        ? (prior?.createdAt ?? FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { jobId, toName, toCity, cardCount: cardCount || undefined };
}

async function recordBatchSubmitFailures(
  db: Firestore,
  settings: LobFulfillmentSettings,
  recipientUids: string[],
  trigger: PrintJobTrigger,
  reason: string,
): Promise<SubmitRecipientResult[]> {
  const postCache = new Map<string, Record<string, unknown> | null>();
  const results: SubmitRecipientResult[] = [];

  for (const recipientUid of recipientUids) {
    const recorded = await recordRecipientSubmitFailure(
      db,
      settings,
      recipientUid,
      trigger,
      reason,
      postCache,
    );
    results.push({
      recipientUid,
      jobId: recorded.jobId,
      status: "failed",
      reason,
      toName: recorded.toName,
      toCity: recorded.toCity,
      cardCount: recorded.cardCount,
    });
  }

  return results;
}

export async function submitLobJobsForRecipients(
  db: Firestore,
  settings: LobFulfillmentSettings,
  recipientUids: string[],
  trigger: PrintJobTrigger,
): Promise<SubmitBatchResult> {
  const uniqueUids = [...new Set(recipientUids.map((u) => u.trim()).filter(Boolean))];
  if (uniqueUids.length > MAX_RECIPIENTS_PER_SUBMIT) {
    throw new Error(`At most ${MAX_RECIPIENTS_PER_SUBMIT} recipients per submit request`);
  }

  if (!settings.lobEnabled) {
    return {
      submitted: 0,
      skipped: uniqueUids.length,
      failed: 0,
      results: uniqueUids.map((recipientUid) => ({
        recipientUid,
        status: "skipped",
        reason: "Lob fulfillment is disabled in settings",
      })),
    };
  }

  if (!(await lobConfigured(db, settings.lobEnvironment))) {
    const reason =
      (await lobSecretMisconfigurationReason(db, settings.lobEnvironment)) ??
      `LOB API key not configured for ${settings.lobEnvironment} mode`;
    const results = await recordBatchSubmitFailures(db, settings, uniqueUids, trigger, reason);
    return {
      submitted: 0,
      skipped: 0,
      failed: uniqueUids.length,
      results,
    };
  }

  const returnErr = validateReturnAddress(settings);
  if (returnErr) {
    const results = await recordBatchSubmitFailures(db, settings, uniqueUids, trigger, returnErr);
    return {
      submitted: 0,
      skipped: 0,
      failed: uniqueUids.length,
      results,
    };
  }

  const fromResult = returnAddressToLobAddress(settings.returnAddress);
  if (!fromResult.ok) {
    throw new Error(fromResult.error);
  }
  const lobFrom = fromResult.address;

  let busyDeliveryIds: Set<string>;
  try {
    busyDeliveryIds = await loadBusyDeliveryIds(db);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load active print jobs";
    throw new Error(`Could not load print job state: ${msg}`);
  }
  const postCache = new Map<string, Record<string, unknown> | null>();
  const results: SubmitRecipientResult[] = [];
  let submitted = 0;
  let skipped = 0;
  let failed = 0;

  const perRecipientResults = await mapWithConcurrency(
    uniqueUids,
    settings.submitConcurrency,
    async (recipientUid) => {
      const uid = recipientUid.trim();
      const localResults: SubmitRecipientResult[] = [];
      let localSubmitted = 0;
      let localSkipped = 0;
      let localFailed = 0;

      try {
        const payload = await buildQueueDetailForRecipient(db, uid, postCache, { scope: "awaiting_print" });
        const eligible = payload.items.filter((item) => (item.deliveryStatus ?? "") === "awaiting_print");

        if (eligible.length === 0) {
          localSkipped += 1;
          localResults.push({
            recipientUid: uid,
            status: "skipped",
            reason: payload.items.length > 0 ? "No awaiting_print cards (may be missing address)" : "Queue empty",
          });
          return { submitted: localSubmitted, skipped: localSkipped, failed: localFailed, results: localResults };
        }

        if (eligible.length < settings.batchMinQueuedCards && trigger === "auto") {
          localSkipped += 1;
          localResults.push({
            recipientUid: uid,
            status: "skipped",
            reason: `Only ${eligible.length} awaiting-print card(s); auto-send threshold is ${settings.batchMinQueuedCards}`,
          });
          return { submitted: localSubmitted, skipped: localSkipped, failed: localFailed, results: localResults };
        }

        const freshItems = eligible.filter((i) => !busyDeliveryIds.has(i.deliveryId));

        if (freshItems.length === 0) {
          localSkipped += 1;
          localResults.push({ recipientUid: uid, status: "skipped", reason: "Deliveries already in an active print job" });
          return { submitted: localSubmitted, skipped: localSkipped, failed: localFailed, results: localResults };
        }

        const toResult = userDocToLobAddress(payload.user);
        if (!toResult.ok) {
          const recorded = await recordRecipientSubmitFailure(
            db,
            settings,
            uid,
            trigger,
            toResult.error,
            postCache,
          );
          localFailed += 1;
          localResults.push({
            recipientUid: uid,
            jobId: recorded.jobId,
            status: "failed",
            reason: toResult.error,
            toName: recorded.toName,
            toCity: recorded.toCity,
            cardCount: recorded.cardCount,
          });
          return { submitted: localSubmitted, skipped: localSkipped, failed: localFailed, results: localResults };
        }

        const lobTo = toResult.address;
        const displayName = lobTo.name;
        const chunks = chunkPostcardsForLobLetters(freshItems, settings.doubleSided);

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex]!;
          let enrichment;
          let html;
          let letterFile;
          const mailPostIds = [...new Set(chunk.map((i) => i.mailPostId))];
          const jobId = printJobIdForRecipient(uid, chunk.map((i) => i.deliveryId));

          try {
            enrichment = await enrichItemsForLobLetter(db, chunk, uid);
            html = buildLobLetterHtml(
              enrichment.items,
              letterHtmlOptions(settings, displayName, enrichment.recipientSnailImageUrl),
            );
            letterFile = await resolveLobLetterFile(html, jobId);
          } catch (prepErr) {
            const msg =
              prepErr instanceof Error ? prepErr.message : "Failed to prepare Lob letter HTML";
            await db.collection(PRINT_JOBS_COLLECTION).doc(jobId).set(
              {
                recipientUid: uid,
                recipientDisplayName: displayName,
                toName: lobTo.name,
                toCity: lobTo.address_city,
                toState: lobTo.address_state,
                toZip: lobTo.address_zip,
                productType: settings.productType,
                deliveryIds: chunk.map((i) => i.deliveryId),
                mailPostIds,
                cardCount: chunk.length,
                status: "failed",
                trigger,
                chunkIndex: chunkIndex + 1,
                chunkTotal: chunks.length,
                errorMessage: msg,
                updatedAt: FieldValue.serverTimestamp(),
                createdAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            localFailed += 1;
            localResults.push({
              recipientUid: uid,
              jobId,
              status: "failed",
              reason: msg,
              toName: lobTo.name,
              toCity: lobTo.address_city,
              cardCount: chunk.length,
            });
            continue;
          }

          const jobRef = db.collection(PRINT_JOBS_COLLECTION).doc(jobId);
          const existing = await jobRef.get();
          const prior = existing.data();
          if (existing.exists) {
            const st = prior?.status;
            if (st === "submitted" || st === "in_production" || st === "mailed") {
              localSkipped += 1;
              localResults.push({
                recipientUid: uid,
                status: "skipped",
                reason: "Print job already submitted",
                jobId,
              });
              continue;
            }
          }

          const priorRetryCount = typeof prior?.retryCount === "number" ? prior.retryCount : 0;
          const retryCount = prior?.status === "failed" ? priorRetryCount + 1 : priorRetryCount;
          const idempotencyKey =
            retryCount > 0 ? `${jobId}_retry${retryCount}`.slice(0, 255) : jobId;

          await jobRef.set(
            {
              recipientUid: uid,
              recipientDisplayName: displayName,
              toName: lobTo.name,
              toCity: lobTo.address_city,
              toState: lobTo.address_state,
              toZip: lobTo.address_zip,
              productType: settings.productType,
              deliveryIds: chunk.map((i) => i.deliveryId),
              mailPostIds,
              cardCount: chunk.length,
              status: "pending",
              trigger,
              chunkIndex: chunkIndex + 1,
              chunkTotal: chunks.length,
              retryCount,
              htmlCharCount: letterFile.htmlCharCount,
              htmlStoragePath: letterFile.htmlStoragePath ?? null,
              htmlStorageUrl: letterFile.htmlStorageUrl ?? null,
              updatedAt: FieldValue.serverTimestamp(),
              createdAt: existing.exists
                ? (prior?.createdAt ?? FieldValue.serverTimestamp())
                : FieldValue.serverTimestamp(),
            },
            { merge: true },
          );

          let letter;
          try {
            const chunkLabel =
              chunks.length > 1 ? ` · sheet ${chunkIndex + 1}/${chunks.length}` : "";
            letter = await createLobLetter(db, settings.lobEnvironment, {
              description: `Snail Mail · ${chunk.length} postcard(s)${chunkLabel}`.slice(0, 255),
              to: lobTo,
              from: lobFrom,
              file: letterFile.file,
              color: settings.color,
              double_sided: settings.doubleSided,
              mail_type: settings.mailType,
              address_placement: settings.addressPlacement,
              size: lobLetterSizeForProduct(settings.productType),
              use_type: "operational",
              idempotencyKey,
              metadata: {
                recipient_uid: uid,
                print_job_id: jobId,
                card_count: String(chunk.length),
                product: settings.productType,
                chunk_index: String(chunkIndex + 1),
                chunk_total: String(chunks.length),
              },
            });
          } catch (lobErr) {
            const err = lobErr as LobApiError;
            const raw = err?.message ?? (lobErr instanceof Error ? lobErr.message : "Lob submit failed");
            const msg = formatLobSubmitErrorMessage(raw);
            await jobRef.set(
              {
                status: "failed",
                errorMessage: msg,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );
            localFailed += 1;
            localResults.push({
              recipientUid: uid,
              jobId,
              status: "failed",
              reason: msg,
              toName: lobTo.name,
              toCity: lobTo.address_city,
              cardCount: chunk.length,
            });
            continue;
          }

          const now = FieldValue.serverTimestamp();
          await jobRef.set(
            {
              status: "submitted",
              lobLetterId: letter.id,
              lobUrl: letter.url ?? null,
              lobTrackingNumber: letter.tracking_number ?? null,
              lobExpectedDeliveryDate: letter.expected_delivery_date ?? null,
              submittedAt: now,
              updatedAt: now,
              errorMessage: null,
            },
            { merge: true },
          );

          const batch = db.batch();
          for (const item of chunk) {
            batch.set(
              deliveryRefForItem(db, item),
              {
                physicalPrintedAt: now,
                isPhysicallyPrinted: true,
                lobLetterId: letter.id,
                fulfillmentStatus: "submitted",
                fulfillmentProvider: "lob",
              },
              { merge: true },
            );
          }
          await batch.commit();

          for (const item of chunk) {
            busyDeliveryIds.add(item.deliveryId);
          }

          localSubmitted += 1;
          localResults.push({
            recipientUid: uid,
            jobId,
            status: "submitted",
            lobLetterId: letter.id,
            cardCount: chunk.length,
            toName: lobTo.name,
            toCity: lobTo.address_city,
            reason: chunks.length > 1 ? `Sheet ${chunkIndex + 1} of ${chunks.length}` : undefined,
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Submit failed";
        const recorded = await recordRecipientSubmitFailure(db, settings, uid, trigger, msg, postCache);
        localFailed += 1;
        localResults.push({
          recipientUid: uid,
          jobId: recorded.jobId,
          status: "failed",
          reason: msg,
          toName: recorded.toName,
          toCity: recorded.toCity,
          cardCount: recorded.cardCount,
        });
      }

      return { submitted: localSubmitted, skipped: localSkipped, failed: localFailed, results: localResults };
    },
  );

  for (const chunk of perRecipientResults) {
    submitted += chunk.submitted;
    skipped += chunk.skipped;
    failed += chunk.failed;
    results.push(...chunk.results);
  }

  return { submitted, skipped, failed, results };
}

const RESUBMIT_ELIGIBLE_STATUSES: PrintJobStatus[] = ["submitted", "in_production", "mailed"];

/** Re-send a successful print job to Lob (new letter + new print job record). */
export async function resubmitPrintJob(
  db: Firestore,
  settings: LobFulfillmentSettings,
  parentJobId: string,
): Promise<SubmitBatchResult> {
  const parentId = parentJobId.trim();
  if (!parentId) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid: "", status: "failed", reason: "jobId required" }],
    };
  }

  if (!settings.lobEnabled) {
    return {
      submitted: 0,
      skipped: 1,
      failed: 0,
      results: [{ recipientUid: "", status: "skipped", reason: "Lob fulfillment is disabled" }],
    };
  }

  const returnErr = validateReturnAddress(settings);
  if (returnErr) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid: "", status: "failed", reason: returnErr }],
    };
  }

  if (!(await lobConfigured(db, settings.lobEnvironment))) {
    const reason =
      (await lobSecretMisconfigurationReason(db, settings.lobEnvironment)) ??
      `LOB API key not configured for ${settings.lobEnvironment} mode`;
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid: "", status: "failed", reason }],
    };
  }

  const fromResult = returnAddressToLobAddress(settings.returnAddress);
  if (!fromResult.ok) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid: "", status: "failed", reason: fromResult.error }],
    };
  }

  const parentRef = db.collection(PRINT_JOBS_COLLECTION).doc(parentId);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid: "", status: "failed", reason: "Print job not found" }],
    };
  }

  const parent = parentSnap.data()!;
  const parentStatus = parent.status as PrintJobStatus;
  if (!RESUBMIT_ELIGIBLE_STATUSES.includes(parentStatus)) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [
        {
          recipientUid: typeof parent.recipientUid === "string" ? parent.recipientUid : "",
          status: "failed",
          reason: `Cannot resubmit job with status "${parentStatus}"`,
          jobId: parentId,
        },
      ],
    };
  }

  const recipientUid = typeof parent.recipientUid === "string" ? parent.recipientUid.trim() : "";
  const deliveryIds = Array.isArray(parent.deliveryIds)
    ? parent.deliveryIds.filter((x): x is string => typeof x === "string")
    : [];

  const mailPostIds = Array.isArray(parent.mailPostIds)
    ? parent.mailPostIds.filter((x): x is string => typeof x === "string")
    : [];

  if (!recipientUid || deliveryIds.length === 0) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid, status: "failed", reason: "Print job missing recipient or deliveries", jobId: parentId }],
    };
  }

  try {
    const postCache = new Map<string, Record<string, unknown> | null>();
    const items = await buildItemsFromDeliveryIds(db, deliveryIds, mailPostIds, recipientUid, postCache);

    if (items.length === 0) {
      return {
        submitted: 0,
        skipped: 0,
        failed: 1,
        results: [
          {
            recipientUid,
            status: "failed",
            reason: "Could not load deliveries for this job",
            jobId: parentId,
          },
        ],
      };
    }

    const userSnap = await db.collection("users").doc(recipientUid).get();
    const user = userSnap.exists ? serializeDoc(userSnap.data())! : null;
    const toResult = userDocToLobAddress(user);
    if (!toResult.ok) {
      return {
        submitted: 0,
        skipped: 0,
        failed: 1,
        results: [{ recipientUid, status: "failed", reason: toResult.error, jobId: parentId }],
      };
    }

    const lobTo = toResult.address;
    const lobFrom = fromResult.address;
    const displayName = lobTo.name;
    const enrichment = await enrichItemsForLobLetter(db, items, recipientUid);
    const html = buildLobLetterHtml(
      enrichment.items,
      letterHtmlOptions(settings, displayName, enrichment.recipientSnailImageUrl),
    );

    const resubmitSeq = (typeof parent.resubmitCount === "number" ? parent.resubmitCount : 0) + 1;
    const newJobId = printJobResubmitId(parentId, resubmitSeq);
    const letterFile = await resolveLobLetterFile(html, newJobId);
    const jobMailPostIds = [...new Set(items.map((i) => i.mailPostId))];
    const idempotencyKey = newJobId;

    const newJobRef = db.collection(PRINT_JOBS_COLLECTION).doc(newJobId);
    await newJobRef.set(
      {
        recipientUid,
        recipientDisplayName: displayName,
        toName: lobTo.name,
        toCity: lobTo.address_city,
        toState: lobTo.address_state,
        toZip: lobTo.address_zip,
        productType: settings.productType,
        deliveryIds: items.map((i) => i.deliveryId),
        mailPostIds: jobMailPostIds,
        cardCount: items.length,
        status: "pending",
        trigger: "manual",
        resubmitOfJobId: parentId,
        resubmitSequence: resubmitSeq,
        htmlCharCount: letterFile.htmlCharCount,
        htmlStoragePath: letterFile.htmlStoragePath ?? null,
        htmlStorageUrl: letterFile.htmlStorageUrl ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: false },
    );

    let letter;
    try {
      letter = await createLobLetter(db, settings.lobEnvironment, {
        description: `Snail Mail resubmit · ${items.length} postcard(s)`.slice(0, 255),
        to: lobTo,
        from: lobFrom,
        file: letterFile.file,
        color: settings.color,
        double_sided: settings.doubleSided,
        mail_type: settings.mailType,
        address_placement: settings.addressPlacement,
        size: lobLetterSizeForProduct(settings.productType),
        use_type: "operational",
        idempotencyKey,
        metadata: {
          recipient_uid: recipientUid,
          print_job_id: newJobId,
          resubmit_of: parentId,
          card_count: String(items.length),
          product: settings.productType,
        },
      });
    } catch (lobErr) {
      const err = lobErr as LobApiError;
      const raw = err?.message ?? (lobErr instanceof Error ? lobErr.message : "Lob submit failed");
      const msg = formatLobSubmitErrorMessage(raw);
      await newJobRef.set(
        { status: "failed", errorMessage: msg, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return {
        submitted: 0,
        skipped: 0,
        failed: 1,
        results: [
          {
            recipientUid,
            jobId: newJobId,
            status: "failed",
            reason: msg,
            toName: lobTo.name,
            toCity: lobTo.address_city,
            cardCount: items.length,
          },
        ],
      };
    }

    const now = FieldValue.serverTimestamp();
    await newJobRef.set(
      {
        status: "submitted",
        lobLetterId: letter.id,
        lobUrl: letter.url ?? null,
        lobTrackingNumber: letter.tracking_number ?? null,
        lobExpectedDeliveryDate: letter.expected_delivery_date ?? null,
        submittedAt: now,
        updatedAt: now,
        errorMessage: null,
      },
      { merge: true },
    );

    await parentRef.set(
      {
        resubmitCount: resubmitSeq,
        lastResubmitJobId: newJobId,
        lastResubmittedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    const batch = db.batch();
    for (const item of items) {
      batch.set(
        deliveryRefForItem(db, item),
        {
          lobLetterId: letter.id,
          fulfillmentStatus: "submitted",
          fulfillmentProvider: "lob",
        },
        { merge: true },
      );
    }
    if (items.length > 0) {
      await batch.commit();
    }

    return {
      submitted: 1,
      skipped: 0,
      failed: 0,
      results: [
        {
          recipientUid,
          jobId: newJobId,
          status: "submitted",
          lobLetterId: letter.id,
          cardCount: items.length,
          toName: lobTo.name,
          toCity: lobTo.address_city,
          reason: `Resubmit of ${parentId}`,
        },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Resubmit failed";
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid, status: "failed", reason: msg, jobId: parentId }],
    };
  }
}

export async function loadLobSettings(db: Firestore): Promise<LobFulfillmentSettings> {
  const { parseLobFulfillmentSettings } = await import("@/lib/lob-fulfillment-settings");
  const snap = await db.collection("adminSettings").doc("lobFulfillment").get();
  return parseLobFulfillmentSettings(serializeDoc(snap.data() ?? undefined) ?? undefined);
}

export function findAutoSendCandidatesFromCounts(
  recipientCounts: Map<string, number>,
  settings: LobFulfillmentSettings,
  _options?: { ignoreMinRecipients?: boolean },
): string[] {
  const candidates: string[] = [];
  for (const [uid, count] of recipientCounts) {
    if (count >= settings.batchMinQueuedCards) candidates.push(uid);
  }

  candidates.sort((a, b) => (recipientCounts.get(b) ?? 0) - (recipientCounts.get(a) ?? 0));
  return candidates.slice(0, settings.batchMaxRecipientsPerRun);
}

export async function findAutoSendCandidates(
  db: Firestore,
  settings: LobFulfillmentSettings,
  options?: { ignoreMinRecipients?: boolean },
): Promise<string[]> {
  const scan = await scanAwaitingPrintByRecipient(db);
  if (!scan.scanComplete) {
    throw new Error("Awaiting-print scan incomplete — run auto processor to finish scanning first");
  }
  return findAutoSendCandidatesFromCounts(scan.recipientCounts, settings, options);
}

export function shouldRunAutoBatch(
  settings: LobFulfillmentSettings,
  lastAutoRunAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (!settings.lobEnabled || settings.autoSendMode !== "scheduled_batch") return false;
  if (!lastAutoRunAt) return true;
  const elapsedMs = now.getTime() - lastAutoRunAt.getTime();
  return elapsedMs >= settings.batchIntervalMinutes * 60_000;
}
