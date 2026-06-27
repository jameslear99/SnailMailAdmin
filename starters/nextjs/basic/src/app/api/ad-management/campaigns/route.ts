import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";

/**
 * Advertiser campaigns will be synced from a separate web app later.
 * This endpoint is a stable placeholder for the admin UI.
 */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    campaigns: [] as unknown[],
    message: "No campaigns loaded yet. Integrate the advertiser app here when ready.",
  });
}
