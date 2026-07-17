import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase-admin";
import {
  clearPhysicalMailEntitlementOverride,
  loadReceivesPhysicalMail,
  resolveReceivesPhysicalMail,
  setPhysicalMailEntitlement,
} from "@/lib/physical-mail-entitlement";
import { requireAdminApi } from "@/lib/require-admin-api";
import { serializeDoc } from "@/lib/serialize-firestore";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ uid: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { uid } = await ctx.params;

  try {
    const db = getAdminDb();
    const [userSnap, publicSnap] = await Promise.all([
      db.collection("users").doc(uid).get(),
      db.collection("publicProfiles").doc(uid).get(),
    ]);

    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userSnap.data() ?? {};
    const publicData = publicSnap.data() ?? {};
    const override = userData.physicalMailEntitlementOverride ?? null;

    return NextResponse.json({
      uid,
      receivesPhysicalMail: resolveReceivesPhysicalMail(userData, publicData),
      publicProfileFlag: publicData.receivesPhysicalMail === true,
      override: override ? serializeDoc(override as Record<string, unknown>) : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load entitlement" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ uid: string }> },
) {
  const auth = await requireAdminApi(req);
  if (auth instanceof NextResponse) return auth;

  const { uid } = await ctx.params;

  let body: {
    receivesPhysicalMail?: unknown;
    reason?: unknown;
    clearOverride?: unknown;
  };
  try {
    body = (await req.json()) as {
      receivesPhysicalMail?: unknown;
      reason?: unknown;
      clearOverride?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.clearOverride === true) {
    try {
      const db = getAdminDb();
      const userSnap = await db.collection("users").doc(uid).get();
      if (!userSnap.exists) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      await clearPhysicalMailEntitlementOverride(db, uid);
      const [userData, publicData] = await Promise.all([
        db.collection("users").doc(uid).get().then((s) => s.data() ?? {}),
        db.collection("publicProfiles").doc(uid).get().then((s) => s.data() ?? {}),
      ]);

      return NextResponse.json({
        uid,
        receivesPhysicalMail: resolveReceivesPhysicalMail(userData, publicData),
        clearedOverride: true,
      });
    } catch (e) {
      console.error(e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to clear override" },
        { status: 500 },
      );
    }
  }

  if (typeof body.receivesPhysicalMail !== "boolean") {
    return NextResponse.json(
      { error: "receivesPhysicalMail (boolean) is required" },
      { status: 400 },
    );
  }

  const reason =
    typeof body.reason === "string" ? body.reason : undefined;

  try {
    const db = getAdminDb();
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { flippedDeliveries } = await setPhysicalMailEntitlement(db, {
      uid,
      receivesPhysicalMail: body.receivesPhysicalMail,
      grantedBy: auth.uid,
      reason,
    });

    const receivesPhysicalMail = await loadReceivesPhysicalMail(db, uid);

    return NextResponse.json({
      uid,
      receivesPhysicalMail,
      flippedDeliveries,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update entitlement" },
      { status: 500 },
    );
  }
}
