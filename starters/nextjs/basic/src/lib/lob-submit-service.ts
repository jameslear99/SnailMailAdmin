import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import {
  buildLobLetterHtml,
  chunkPostcardsForLobLetters,
  POSTCARDS_PER_LOB_LETTER_MAX,
} from "@/lib/build-lob-letter-html";
import { buildItemsFromDeliveryIds, buildQueueDetailPayload } from "@/lib/build-print-queue-detail";
import { enrichItemsForLobLetter } from "@/lib/enrich-lob-letter-items";
import { returnAddressToLobAddress, userDocToLobAddress } from "@/lib/lob-address";
import { createLobLetter, formatLobSubmitErrorMessage, lobConfigured, type LobApiError } from "@/lib/lob-client";
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
import { isInPrintQueue, type DeliveryDocShape } from "@/lib/print-fulfillment";
import { MAX_DELIVERY_DOCS_SCAN, normalizedRecipientId, scanAllDeliveryDocs } from "@/lib/printing-delivery-scan";
import { serializeDoc } from "@/lib/serialize-firestore";

/** Lob letters pack many postcards across compact multi-page HTML (cover + 4-up pages). */
export const MAX_POSTCARDS_PER_LETTER = POSTCARDS_PER_LOB_LETTER_MAX;

export const MAX_RECIPIENTS_PER_SUBMIT = 25;

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
  const snap = await db
    .collection(PRINT_JOBS_COLLECTION)
    .where("status", "in", ["pending", "submitted", "in_production", "mailed"])
    .limit(500)
    .get();

  for (const doc of snap.docs) {
    const ids = doc.data().deliveryIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id === "string") busy.add(id);
    }
  }
  return busy;
}

function validateReturnAddress(settings: LobFulfillmentSettings): string | null {
  const fromResult = returnAddressToLobAddress(settings.returnAddress);
  if (!fromResult.ok) return `Return address invalid: ${fromResult.error}`;
  return null;
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
    return {
      submitted: 0,
      skipped: 0,
      failed: uniqueUids.length,
      results: uniqueUids.map((recipientUid) => ({
        recipientUid,
        status: "failed",
        reason: `LOB API key not configured for ${settings.lobEnvironment} mode`,
      })),
    };
  }

  const returnErr = validateReturnAddress(settings);
  if (returnErr) {
    return {
      submitted: 0,
      skipped: 0,
      failed: uniqueUids.length,
      results: uniqueUids.map((recipientUid) => ({
        recipientUid,
        status: "failed",
        reason: returnErr,
      })),
    };
  }

  const fromResult = returnAddressToLobAddress(settings.returnAddress);
  if (!fromResult.ok) {
    throw new Error(fromResult.error);
  }
  const lobFrom = fromResult.address;

  const allDocs = await scanAllDeliveryDocs(db);
  if (allDocs.length >= MAX_DELIVERY_DOCS_SCAN) {
    throw new Error(`Too many delivery documents (>= ${MAX_DELIVERY_DOCS_SCAN}).`);
  }

  const busyDeliveryIds = await loadBusyDeliveryIds(db);
  const postCache = new Map<string, Record<string, unknown> | null>();
  const results: SubmitRecipientResult[] = [];
  let submitted = 0;
  let skipped = 0;
  let failed = 0;

  for (const recipientUid of uniqueUids) {
    const uid = recipientUid.trim();

    try {
      const payload = await buildQueueDetailPayload(db, uid, allDocs, postCache);
      const eligible = payload.items.filter((item) => (item.deliveryStatus ?? "") === "awaiting_print");

      if (eligible.length === 0) {
        skipped++;
        results.push({
          recipientUid: uid,
          status: "skipped",
          reason: payload.items.length > 0 ? "No awaiting_print cards (may be missing address)" : "Queue empty",
        });
        continue;
      }

      if (eligible.length < settings.batchMinQueuedCards && trigger === "auto") {
        skipped++;
        results.push({
          recipientUid: uid,
          status: "skipped",
          reason: `Only ${eligible.length} card(s); batchMinQueuedCards is ${settings.batchMinQueuedCards}`,
        });
        continue;
      }

      const freshItems = eligible.filter((i) => !busyDeliveryIds.has(i.deliveryId));

      if (freshItems.length === 0) {
        skipped++;
        results.push({ recipientUid: uid, status: "skipped", reason: "Deliveries already in an active print job" });
        continue;
      }

      const toResult = userDocToLobAddress(payload.user);
      if (!toResult.ok) {
        failed++;
        results.push({
          recipientUid: uid,
          status: "failed",
          reason: toResult.error,
        });
        continue;
      }

      const lobTo = toResult.address;
      const displayName = lobTo.name;
      const chunks = chunkPostcardsForLobLetters(freshItems, settings.doubleSided);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex]!;
        const enrichment = await enrichItemsForLobLetter(db, chunk, uid);
        const html = buildLobLetterHtml(enrichment.items, {
          recipientName: displayName,
          recipientSnailImageUrl: enrichment.recipientSnailImageUrl,
          doubleSided: settings.doubleSided,
        });
        const mailPostIds = [...new Set(chunk.map((i) => i.mailPostId))];
        const jobId = printJobIdForRecipient(uid, chunk.map((i) => i.deliveryId));
        const letterFile = await resolveLobLetterFile(html, jobId);

        const jobRef = db.collection(PRINT_JOBS_COLLECTION).doc(jobId);
        const existing = await jobRef.get();
        const prior = existing.data();
        if (existing.exists) {
          const st = prior?.status;
          if (st === "submitted" || st === "in_production" || st === "mailed") {
            skipped++;
            results.push({
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
          failed++;
          results.push({
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

        const matchingDocs = allDocs.filter((doc) => {
          const d = doc.data() as DeliveryDocShape;
          if (normalizedRecipientId(d) !== uid) return false;
          return chunk.some((i) => i.deliveryId === doc.id) && isInPrintQueue(d);
        });

        if (matchingDocs.length > 0) {
          const batch = db.batch();
          for (const doc of matchingDocs) {
            batch.set(
              doc.ref,
              {
                physicalPrintedAt: now,
                lobLetterId: letter.id,
                fulfillmentStatus: "submitted",
                fulfillmentProvider: "lob",
              },
              { merge: true },
            );
          }
          await batch.commit();
        }

        for (const item of chunk) {
          busyDeliveryIds.add(item.deliveryId);
        }

        submitted++;
        results.push({
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
      failed++;
      const err = e as LobApiError;
      const msg = err?.message ?? (e instanceof Error ? e.message : "Submit failed");
      results.push({ recipientUid: uid, status: "failed", reason: msg });
    }
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

  if (!recipientUid || deliveryIds.length === 0) {
    return {
      submitted: 0,
      skipped: 0,
      failed: 1,
      results: [{ recipientUid, status: "failed", reason: "Print job missing recipient or deliveries", jobId: parentId }],
    };
  }

  try {
    const allDocs = await scanAllDeliveryDocs(db);
    const postCache = new Map<string, Record<string, unknown> | null>();
    const items = await buildItemsFromDeliveryIds(db, deliveryIds, allDocs, postCache);

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
    const html = buildLobLetterHtml(enrichment.items, {
      recipientName: displayName,
      recipientSnailImageUrl: enrichment.recipientSnailImageUrl,
      doubleSided: settings.doubleSided,
    });

    const resubmitSeq = (typeof parent.resubmitCount === "number" ? parent.resubmitCount : 0) + 1;
    const newJobId = printJobResubmitId(parentId, resubmitSeq);
    const letterFile = await resolveLobLetterFile(html, newJobId);
    const mailPostIds = [...new Set(items.map((i) => i.mailPostId))];
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
        mailPostIds,
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

    const deliveryIdSet = new Set(items.map((i) => i.deliveryId));
    const matchingDocs = allDocs.filter((doc) => deliveryIdSet.has(doc.id));
    if (matchingDocs.length > 0) {
      const batch = db.batch();
      for (const doc of matchingDocs) {
        batch.set(
          doc.ref,
          {
            lobLetterId: letter.id,
            fulfillmentStatus: "submitted",
            fulfillmentProvider: "lob",
          },
          { merge: true },
        );
      }
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

export async function findAutoSendCandidates(
  db: Firestore,
  settings: LobFulfillmentSettings,
  options?: { ignoreMinRecipients?: boolean },
): Promise<string[]> {
  const allDocs = await scanAllDeliveryDocs(db);
  const counts = new Map<string, number>();

  for (const doc of allDocs) {
    const d = doc.data() as DeliveryDocShape;
    if ((d.deliveryStatus ?? "") !== "awaiting_print") continue;
    if (d.physicalPrintedAt != null) continue;
    const uid = normalizedRecipientId(d);
    if (!uid) continue;
    counts.set(uid, (counts.get(uid) ?? 0) + 1);
  }

  const candidates: string[] = [];
  for (const [uid, count] of counts) {
    if (count >= settings.batchMinQueuedCards) candidates.push(uid);
  }

  if (
    !options?.ignoreMinRecipients &&
    settings.batchMinRecipients > 0 &&
    candidates.length < settings.batchMinRecipients
  ) {
    return [];
  }

  candidates.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  return candidates.slice(0, settings.batchMaxRecipientsPerRun);
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
