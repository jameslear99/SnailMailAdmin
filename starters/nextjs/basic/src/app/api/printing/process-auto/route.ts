import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  findAutoSendCandidates,
  loadLobSettings,
  shouldRunAutoBatch,
  submitLobJobsForRecipients,
} from "@/lib/lob-submit-service";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

/**
 * Process automatic Lob submissions per `adminSettings/lobFulfillment`.
 * Safe to call on a schedule or from the jobs UI.
 */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const settings = await loadLobSettings(db);
    const settingsSnap = await db.collection("adminSettings").doc("lobFulfillment").get();
    const lastRaw = settingsSnap.data()?.lastAutoRunAt;
    const lastAutoRunAt =
      lastRaw instanceof Timestamp ? lastRaw.toDate() : lastRaw instanceof Date ? lastRaw : null;

    if (!settings.lobEnabled) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: "Lob fulfillment disabled",
      });
    }

    if (settings.autoSendMode === "disabled") {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: "Auto send disabled",
      });
    }

    if (settings.autoSendMode === "scheduled_batch" && !shouldRunAutoBatch(settings, lastAutoRunAt)) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: `Waiting for batch interval (${settings.batchIntervalMinutes} min)`,
        lastAutoRunAt: lastAutoRunAt?.toISOString() ?? null,
      });
    }

    const candidates = await findAutoSendCandidates(db, settings, {
      ignoreMinRecipients: settings.autoSendMode === "immediate",
    });
    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        ran: false,
        reason: "No eligible recipients in queue",
      });
    }

    const result = await submitLobJobsForRecipients(db, settings, candidates, "auto");

    await db.collection("adminSettings").doc("lobFulfillment").set(
      { lastAutoRunAt: FieldValue.serverTimestamp() },
      { merge: true },
    );

    return NextResponse.json({
      ok: true,
      ran: true,
      candidateCount: candidates.length,
      ...result,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "process-auto failed" },
      { status: 500 },
    );
  }
}

/** GET returns whether auto processor would run now (dry check). */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const settings = await loadLobSettings(db);
    const settingsSnap = await db.collection("adminSettings").doc("lobFulfillment").get();
    const ser = serializeDoc(settingsSnap.data() ?? undefined);
    const lastIso = typeof ser?.lastAutoRunAt === "string" ? ser.lastAutoRunAt : undefined;
    const lastAutoRunAt = lastIso ? new Date(lastIso) : null;
    const candidates = await findAutoSendCandidates(db, settings, {
      ignoreMinRecipients: settings.autoSendMode === "immediate",
    });

    return NextResponse.json({
      settings: {
        lobEnabled: settings.lobEnabled,
        autoSendMode: settings.autoSendMode,
        batchIntervalMinutes: settings.batchIntervalMinutes,
        batchMinQueuedCards: settings.batchMinQueuedCards,
        batchMinRecipients: settings.batchMinRecipients,
      },
      lastAutoRunAt: lastIso ?? null,
      wouldRun:
        settings.lobEnabled &&
        settings.autoSendMode !== "disabled" &&
        (settings.autoSendMode === "immediate" ||
          shouldRunAutoBatch(settings, lastAutoRunAt && !Number.isNaN(lastAutoRunAt.getTime()) ? lastAutoRunAt : null)),
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 10),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "process-auto GET failed" },
      { status: 500 },
    );
  }
}
