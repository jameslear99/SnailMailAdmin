"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiFetch, apiJson } from "@/lib/api-fetch";
import { UserSnailSection } from "@/components/users/user-snail-section";

type PhysicalMailEntitlement = {
  uid: string;
  receivesPhysicalMail: boolean;
  publicProfileFlag: boolean;
  override: {
    active?: boolean;
    reason?: string;
    grantedBy?: string;
    grantedAt?: string;
    source?: string;
  } | null;
};

export default function UserDetailPage() {
  const params = useParams();
  const uid = decodeURIComponent(String(params.uid ?? ""));
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [entitlement, setEntitlement] = useState<PhysicalMailEntitlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entitlementMessage, setEntitlementMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [entitlementBusy, setEntitlementBusy] = useState(false);

  const loadEntitlement = useCallback(async () => {
    if (!uid) return;
    const data = await apiJson<PhysicalMailEntitlement>(
      `/api/users/${encodeURIComponent(uid)}/physical-mail-entitlement`,
    );
    setEntitlement(data);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const userData = await apiJson<Record<string, unknown>>(
          `/api/users/${encodeURIComponent(uid)}`,
        );
        if (!cancelled) {
          setDoc(userData);
          await loadEntitlement();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, loadEntitlement]);

  async function updateEntitlement(receivesPhysicalMail: boolean) {
    setEntitlementBusy(true);
    setError(null);
    setEntitlementMessage(null);
    try {
      const res = await apiFetch(
        `/api/users/${encodeURIComponent(uid)}/physical-mail-entitlement`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            receivesPhysicalMail,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      const data = (await res.json()) as {
        receivesPhysicalMail: boolean;
        flippedDeliveries?: number;
      };
      await loadEntitlement();
      const flipped = data.flippedDeliveries ?? 0;
      setEntitlementMessage(
        receivesPhysicalMail
          ? `Granted physical mail.${flipped > 0 ? ` ${flipped} recent digital-only delivery(ies) moved to the print queue.` : ""}`
          : "Revoked physical mail. Future posts will be digital-only for this user.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Entitlement update failed");
    } finally {
      setEntitlementBusy(false);
    }
  }

  async function clearOverride() {
    setEntitlementBusy(true);
    setError(null);
    setEntitlementMessage(null);
    try {
      const res = await apiFetch(
        `/api/users/${encodeURIComponent(uid)}/physical-mail-entitlement`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clearOverride: true }),
        },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      await loadEntitlement();
      setEntitlementMessage(
        "Admin override cleared. Effective entitlement now follows the public profile subscription flag.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear override");
    } finally {
      setEntitlementBusy(false);
    }
  }

  const snail = doc?.snail as Record<string, unknown> | undefined;
  const address = doc?.address as Record<string, unknown> | undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p>
        <Link href="/users" className="text-sm text-[#4F6E43] hover:underline">
          ← Users
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-[#2E2A24]">User {uid}</h1>
      {error ? <p className="text-red-700">{error}</p> : null}
      {!doc && !error ? <p className="text-[#5C564D]">Loading…</p> : null}
      {doc ? (
        <div className="grid gap-6">
          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Profile</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Row label="Username" value={String(doc.username ?? "—")} />
              <Row label="Display name" value={String(doc.displayName ?? "—")} />
              <Row label="Bio" value={String(doc.bio ?? "—")} />
              <Row
                label="Photo"
                value={
                  doc.profilePhotoUrl ? (
                    <a
                      href={String(doc.profilePhotoUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#4F6E43] underline break-all"
                    >
                      Open
                    </a>
                  ) : (
                    "—"
                  )
                }
              />
              <Row label="Mails delivered (total)" value={String(doc.mailsDeliveredTotal ?? 0)} />
            </dl>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">SnailMail Pro — physical mail</h2>
            <p className="mt-1 text-sm text-[#5C564D]">
              Controls whether this user is eligible for physical printing in the admin queue.
              Admin overrides take precedence over the app subscription flag.
            </p>

            {entitlement ? (
              <dl className="mt-4 space-y-2 text-sm">
                <Row
                  label="Effective"
                  value={
                    <span
                      className={
                        entitlement.receivesPhysicalMail
                          ? "font-medium text-[#4F6E43]"
                          : "text-[#5C564D]"
                      }
                    >
                      {entitlement.receivesPhysicalMail
                        ? "Receives physical mail"
                        : "Digital only"}
                    </span>
                  }
                />
                <Row
                  label="Subscription flag"
                  value={
                    entitlement.publicProfileFlag
                      ? "SnailMail Pro (public profile)"
                      : "Free (public profile)"
                  }
                />
                <Row
                  label="Admin override"
                  value={
                    entitlement.override ? (
                      <span>
                        {entitlement.override.active ? "Granted" : "Revoked"}
                        {entitlement.override.reason ? (
                          <> — {entitlement.override.reason}</>
                        ) : null}
                        {entitlement.override.grantedAt ? (
                          <span className="block text-xs text-[#5C564D]">
                            Set {entitlement.override.grantedAt}
                            {entitlement.override.grantedBy
                              ? ` by ${entitlement.override.grantedBy}`
                              : ""}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      "None"
                    )
                  }
                />
              </dl>
            ) : (
              <p className="mt-4 text-sm text-[#5C564D]">Loading entitlement…</p>
            )}

            <label className="mt-4 block text-sm">
              <span className="font-medium text-[#2E2A24]">Reason (optional)</span>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. comp account, support refund"
                className="mt-1 block w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-[#2E2A24] outline-none focus:border-[#4F6E43]"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={entitlementBusy || entitlement?.receivesPhysicalMail === true}
                onClick={() => void updateEntitlement(true)}
                className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
              >
                Grant physical mail
              </button>
              <button
                type="button"
                disabled={entitlementBusy || entitlement?.receivesPhysicalMail === false}
                onClick={() => void updateEntitlement(false)}
                className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-60"
              >
                Revoke physical mail
              </button>
              {entitlement?.override ? (
                <button
                  type="button"
                  disabled={entitlementBusy}
                  onClick={() => void clearOverride()}
                  className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#5C564D] hover:bg-[#F0F5EA] disabled:opacity-60"
                >
                  Clear admin override
                </button>
              ) : null}
            </div>

            {entitlementMessage ? (
              <p className="mt-3 text-sm text-[#4F6E43]">{entitlementMessage}</p>
            ) : null}
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Mailing address</h2>
            {address ? (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs font-mono text-[#2E2A24]">
                {JSON.stringify(address, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-[#5C564D]">No address on file.</p>
            )}
          </section>

          {snail ? (
            <UserSnailSection
              snail={snail}
              onSnailUpdated={(updated) => {
                setDoc((prev) => (prev ? { ...prev, snail: updated } : prev));
              }}
            />
          ) : (
            <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
              <h2 className="font-medium text-[#2E2A24]">Snail</h2>
              <p className="mt-3 text-sm text-[#5C564D]">No snail payload.</p>
            </section>
          )}

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Raw document</h2>
            <pre className="mt-3 max-h-[480px] overflow-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs font-mono text-[#2E2A24]">
              {JSON.stringify(doc, null, 2)}
            </pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-40 shrink-0 text-[#5C564D]">{label}</dt>
      <dd className="min-w-0 text-[#2E2A24]">{value}</dd>
    </div>
  );
}
