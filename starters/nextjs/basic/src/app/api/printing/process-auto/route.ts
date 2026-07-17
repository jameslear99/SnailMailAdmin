import { Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { runLobAutoProcessor } from "@/lib/lob-auto-processor";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadLobSettings } from "@/lib/lob-submit-service";
import { requireAdminOrCronApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

/**
 * Process automatic Lob submissions per `adminSettings/lobFulfillment`.
 * Callable by admins (Bearer token) or Cloud Scheduler (`x-cron-secret`).
 */
export async function POST(req: Request) {
  const auth = await requireAdminOrCronApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const settings = await loadLobSettings(db);
    const settingsSnap = await db.collection("adminSettings").doc("lobFulfillment").get();
    const lastRaw = settingsSnap.data()?.lastAutoRunAt;
    const lastAutoRunAt =
      lastRaw instanceof Timestamp ? lastRaw.toDate() : lastRaw instanceof Date ? lastRaw : null;

    const force = new URL(req.url).searchParams.get("force") === "1";
    const result = await runLobAutoProcessor(db, settings, { lastAutoRunAt, force });

    return NextResponse.json({
      ok: true,
      auth: auth.kind,
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
  const auth = await requireAdminOrCronApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const settings = await loadLobSettings(db);
    const settingsSnap = await db.collection("adminSettings").doc("lobFulfillment").get();
    const ser = serializeDoc(settingsSnap.data() ?? undefined);
    const lastIso = typeof ser?.lastAutoRunAt === "string" ? ser.lastAutoRunAt : undefined;
    const lastAutoRunAt = lastIso ? new Date(lastIso) : null;

    const { loadProcessorTelemetry } = await import("@/lib/lob-auto-processor");
    const telemetry = await loadProcessorTelemetry(db);

    const { shouldRunAutoBatch } = await import("@/lib/lob-submit-service");
    const wouldRunInterval =
      settings.autoSendMode === "immediate" ||
      shouldRunAutoBatch(settings, lastAutoRunAt && !Number.isNaN(lastAutoRunAt.getTime()) ? lastAutoRunAt : null);

    return NextResponse.json({
      settings: {
        lobEnabled: settings.lobEnabled,
        autoSendMode: settings.autoSendMode,
        batchIntervalMinutes: settings.batchIntervalMinutes,
        batchMinQueuedCards: settings.batchMinQueuedCards,
        batchMinRecipients: settings.batchMinRecipients,
        batchMaxRecipientsPerRun: settings.batchMaxRecipientsPerRun,
        submitConcurrency: settings.submitConcurrency,
      },
      lastAutoRunAt: lastIso ?? null,
      processor: telemetry,
      wouldRun:
        settings.lobEnabled && settings.autoSendMode !== "disabled" && wouldRunInterval,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "process-auto GET failed" },
      { status: 500 },
    );
  }
}
