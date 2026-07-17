import "server-only";

import { NextResponse } from "next/server";

import { getAdminApp } from "@/lib/firebase-admin";

export type AdminAuthed = { kind: "admin"; uid: string; email: string | null };
export type CronAuthed = { kind: "cron" };
export type ApiAuthed = AdminAuthed | CronAuthed;

/** Guard API route handlers — returns a Response on failure. */
export async function requireAdminApi(req: Request): Promise<AdminAuthed | NextResponse> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const decoded = await getAdminApp().auth().verifyIdToken(token);
    if (decoded.admin !== true) {
      return NextResponse.json(
        { error: "Forbidden — admin access required" },
        { status: 403 },
      );
    }
    return { kind: "admin", uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/**
 * Accepts admin Bearer token or `x-cron-secret` for server-side schedulers.
 * Set `LOB_AUTO_CRON_SECRET` in App Hosting / Cloud Functions.
 */
export async function requireAdminOrCronApi(req: Request): Promise<ApiAuthed | NextResponse> {
  const cronSecret = process.env.LOB_AUTO_CRON_SECRET?.trim();
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";
  if (cronSecret && headerSecret && headerSecret === cronSecret) {
    return { kind: "cron" };
  }
  const admin = await requireAdminApi(req);
  if (admin instanceof NextResponse) return admin;
  return admin;
}
