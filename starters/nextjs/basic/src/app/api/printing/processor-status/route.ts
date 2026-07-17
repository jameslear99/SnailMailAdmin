import { NextResponse } from "next/server";

import { loadProcessorTelemetry } from "@/lib/lob-auto-processor";
import { getAdminDb } from "@/lib/firebase-admin";
import { loadLobSettings } from "@/lib/lob-submit-service";
import { requireAdminApi } from "@/lib/require-admin-api";

/** Latest auto-processor telemetry and queue scan status. */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const db = getAdminDb();
    const [settings, processor] = await Promise.all([
      loadLobSettings(db),
      loadProcessorTelemetry(db),
    ]);

    return NextResponse.json({
      settings: {
        autoSendMode: settings.autoSendMode,
        batchMinQueuedCards: settings.batchMinQueuedCards,
        batchMaxRecipientsPerRun: settings.batchMaxRecipientsPerRun,
        batchIntervalMinutes: settings.batchIntervalMinutes,
        submitConcurrency: settings.submitConcurrency,
      },
      processor,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "processor-status failed" },
      { status: 500 },
    );
  }
}
