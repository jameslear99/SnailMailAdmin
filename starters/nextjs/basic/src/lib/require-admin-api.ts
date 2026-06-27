import "server-only";

import { NextResponse } from "next/server";

import { getAdminApp } from "@/lib/firebase-admin";

export type AdminAuthed = { uid: string; email: string | null };

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
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
