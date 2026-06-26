import { NextResponse } from "next/server";

/**
 * Advertiser campaigns will be synced from a separate web app later.
 * This endpoint is a stable placeholder for the admin UI.
 */
export async function GET() {
  return NextResponse.json({
    campaigns: [] as unknown[],
    message: "No campaigns loaded yet. Integrate the advertiser app here when ready.",
  });
}
