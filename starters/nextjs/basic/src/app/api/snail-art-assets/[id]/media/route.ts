import { NextResponse } from "next/server";

import { getAdminBucket, getAdminDb } from "@/lib/firebase-admin";
import { requireAdminApi } from "@/lib/require-admin-api";

const MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  webp: "image/webp",
};

/** Stream a catalog layer file from Storage (same-origin for admin canvas export). */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const doc = await getAdminDb().collection("snailArtAssets").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const storagePath = doc.get("storagePath") as string | undefined;
    if (!storagePath?.trim()) {
      return NextResponse.json({ error: "No storage file" }, { status: 404 });
    }

    const fileFormat = (doc.get("fileFormat") as string | undefined) ?? "png";
    const [data] = await getAdminBucket().file(storagePath).download();
    const contentType = MIME[fileFormat] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load media" },
      { status: 500 },
    );
  }
}
