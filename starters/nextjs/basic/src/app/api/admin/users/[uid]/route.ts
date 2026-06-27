import { NextResponse } from "next/server";

import { revokeAdminUser } from "@/lib/admin-users";
import { requireAdminApi } from "@/lib/require-admin-api";

/** DELETE /api/admin/users/[uid] — revoke admin access. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ uid: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { uid } = await ctx.params;
  if (!uid?.trim()) {
    return NextResponse.json({ error: "Missing uid" }, { status: 400 });
  }

  try {
    await revokeAdminUser({ uid: uid.trim(), revokedBy: auth });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Failed to revoke admin";
    const status =
      message.includes("cannot remove") || message.includes("your own") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
