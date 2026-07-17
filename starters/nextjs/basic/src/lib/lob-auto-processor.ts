import "server-only";

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import type { LobFulfillmentSettings } from "@/lib/lob-fulfillment-settings";
import {
  findAutoSendCandidatesFromCounts,
  shouldRunAutoBatch,
  submitLobJobsForRecipients,
  type SubmitBatchResult,
} from "@/lib/lob-submit-service";
import { scanAwaitingPrintByRecipient } from "@/lib/printing-delivery-scan";
import { serializeDoc } from "@/lib/serialize-firestore";

export const LOB_AUTO_PROCESSOR_DOC = "lobAutoProcessor";

export type ProcessorTelemetry = {
  ranAt: string;
  durationMs: number;
  scanComplete: boolean;
  scanPages: number;
  scanDocsRead: number;
  unprintedAwaitingCount: number;
  distinctRecipients: number;
  eligibleRecipients: number;
  candidateCount: number;
  submitted: number;
  skipped: number;
  failed: number;
  warnings: string[];
  resumeAfterPath: string | null;
};

export type ProcessorRunResult = {
  ran: boolean;
  reason?: string;
  telemetry?: ProcessorTelemetry;
  submit?: SubmitBatchResult;
};

type ProcessorState = {
  scanResumeAfterPath?: string | null;
  partialRecipientCounts?: Record<string, number>;
};

function countsFromRecord(record?: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  if (!record) return map;
  for (const [uid, count] of Object.entries(record)) {
    if (typeof count === "number" && count > 0) map.set(uid, count);
  }
  return map;
}

function recordFromCounts(counts: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [uid, count] of counts) out[uid] = count;
  return out;
}

async function loadProcessorState(db: Firestore): Promise<ProcessorState> {
  const snap = await db.collection("adminSettings").doc(LOB_AUTO_PROCESSOR_DOC).get();
  const raw = serializeDoc(snap.data() ?? undefined) ?? {};
  return {
    scanResumeAfterPath:
      typeof raw.scanResumeAfterPath === "string" ? raw.scanResumeAfterPath : null,
    partialRecipientCounts:
      raw.partialRecipientCounts && typeof raw.partialRecipientCounts === "object"
        ? (raw.partialRecipientCounts as Record<string, number>)
        : undefined,
  };
}

async function saveProcessorState(
  db: Firestore,
  scan: {
    scanComplete: boolean;
    resumeAfterPath: string | null;
    recipientCounts: Map<string, number>;
  },
): Promise<void> {
  if (scan.scanComplete) {
    await db.collection("adminSettings").doc(LOB_AUTO_PROCESSOR_DOC).set(
      {
        scanResumeAfterPath: null,
        partialRecipientCounts: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  await db.collection("adminSettings").doc(LOB_AUTO_PROCESSOR_DOC).set(
    {
      scanResumeAfterPath: scan.resumeAfterPath,
      partialRecipientCounts: recordFromCounts(scan.recipientCounts),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function saveTelemetry(db: Firestore, telemetry: ProcessorTelemetry): Promise<void> {
  await db.collection("adminSettings").doc(LOB_AUTO_PROCESSOR_DOC).set(
    {
      lastRunAt: FieldValue.serverTimestamp(),
      lastRunStats: telemetry,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function loadProcessorTelemetry(
  db: Firestore,
): Promise<{ lastRunAt: string | null; lastRunStats: ProcessorTelemetry | null; scanResumeAfterPath: string | null }> {
  const snap = await db.collection("adminSettings").doc(LOB_AUTO_PROCESSOR_DOC).get();
  const raw = serializeDoc(snap.data() ?? undefined) ?? {};
  const lastRunAt = typeof raw.lastRunAt === "string" ? raw.lastRunAt : null;
  const lastRunStats =
    raw.lastRunStats && typeof raw.lastRunStats === "object"
      ? (raw.lastRunStats as ProcessorTelemetry)
      : null;
  const scanResumeAfterPath =
    typeof raw.scanResumeAfterPath === "string" ? raw.scanResumeAfterPath : null;
  return { lastRunAt, lastRunStats, scanResumeAfterPath };
}

export async function runLobAutoProcessor(
  db: Firestore,
  settings: LobFulfillmentSettings,
  options?: {
    lastAutoRunAt?: Date | null;
    force?: boolean;
  },
): Promise<ProcessorRunResult> {
  const started = Date.now();

  if (!settings.lobEnabled) {
    return { ran: false, reason: "Lob fulfillment disabled" };
  }

  if (settings.autoSendMode === "disabled") {
    return { ran: false, reason: "Auto send disabled" };
  }

  if (
    !options?.force &&
    settings.autoSendMode === "scheduled_batch" &&
    !shouldRunAutoBatch(settings, options?.lastAutoRunAt ?? null)
  ) {
    return {
      ran: false,
      reason: `Waiting for batch interval (${settings.batchIntervalMinutes} min)`,
    };
  }

  const processorState = await loadProcessorState(db);
  const seedCounts = countsFromRecord(processorState.partialRecipientCounts);

  const scan = await scanAwaitingPrintByRecipient(db, {
    resumeAfterPath: processorState.scanResumeAfterPath,
    seedCounts: seedCounts.size > 0 ? seedCounts : undefined,
  });

  await saveProcessorState(db, scan);

  const warnings = [...scan.warnings];
  const eligibleRecipients = [...scan.recipientCounts.entries()].filter(
    ([, count]) => count >= settings.batchMinQueuedCards,
  ).length;

  if (!scan.scanComplete) {
    const telemetry: ProcessorTelemetry = {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      scanComplete: false,
      scanPages: scan.pagesScanned,
      scanDocsRead: scan.totalDocsRead,
      unprintedAwaitingCount: scan.unprintedCount,
      distinctRecipients: scan.recipientCounts.size,
      eligibleRecipients,
      candidateCount: 0,
      submitted: 0,
      skipped: 0,
      failed: 0,
      warnings,
      resumeAfterPath: scan.resumeAfterPath,
    };
    await saveTelemetry(db, telemetry);

    return {
      ran: false,
      reason: "Scan in progress — resuming on next run",
      telemetry,
    };
  }

  const candidates = findAutoSendCandidatesFromCounts(scan.recipientCounts, settings);

  if (candidates.length === 0) {
    const telemetry: ProcessorTelemetry = {
      ranAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      scanComplete: true,
      scanPages: scan.pagesScanned,
      scanDocsRead: scan.totalDocsRead,
      unprintedAwaitingCount: scan.unprintedCount,
      distinctRecipients: scan.recipientCounts.size,
      eligibleRecipients,
      candidateCount: 0,
      submitted: 0,
      skipped: 0,
      failed: 0,
      warnings,
      resumeAfterPath: null,
    };
    await saveTelemetry(db, telemetry);

    return {
      ran: false,
      reason: `No recipients with at least ${settings.batchMinQueuedCards} awaiting-print postcard(s)`,
      telemetry,
    };
  }

  const submit = await submitLobJobsForRecipients(db, settings, candidates, "auto");

  const telemetry: ProcessorTelemetry = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    scanComplete: true,
    scanPages: scan.pagesScanned,
    scanDocsRead: scan.totalDocsRead,
    unprintedAwaitingCount: scan.unprintedCount,
    distinctRecipients: scan.recipientCounts.size,
    eligibleRecipients,
    candidateCount: candidates.length,
    submitted: submit.submitted,
    skipped: submit.skipped,
    failed: submit.failed,
    warnings,
    resumeAfterPath: null,
  };

  await saveTelemetry(db, telemetry);

  await db.collection("adminSettings").doc("lobFulfillment").set(
    { lastAutoRunAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  return { ran: true, telemetry, submit };
}
