import { NextResponse } from "next/server";

import { createAdminUser, listAdminUsersForViewer } from "@/lib/admin-users";
import { requireAdminApi } from "@/lib/require-admin-api";

/** GET /api/admin/users — list staff admin accounts. */
export async function GET(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const admins = await listAdminUsersForViewer(auth.uid);
    return NextResponse.json({ admins });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load admins" },
      { status: 500 },
    );
  }
}

/** POST /api/admin/users — create or promote an admin (email + password). */
export async function POST(req: Request) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  try {
    const admin = await createAdminUser({ email, password, createdBy: auth });
    return NextResponse.json({ admin });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : "Failed to create admin";
    const status = message.includes("Invalid") || message.includes("Password") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
