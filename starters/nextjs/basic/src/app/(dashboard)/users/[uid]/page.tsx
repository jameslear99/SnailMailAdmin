"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

export default function UserDetailPage() {
  const params = useParams();
  const uid = decodeURIComponent(String(params.uid ?? ""));
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Record<string, unknown>>(`/api/users/${encodeURIComponent(uid)}`);
        if (!cancelled) setDoc(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const snail = doc?.snail as Record<string, unknown> | undefined;
  const address = doc?.address as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      <p>
        <Link href="/users" className="text-sm text-[#4F6E43] hover:underline">
          ← Users
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-[#2E2A24]">User {uid}</h1>
      {error ? <p className="text-red-700">{error}</p> : null}
      {!doc && !error ? <p className="text-[#5C564D]">Loading…</p> : null}
      {doc ? (
        <div className="grid gap-6 lg:grid-cols-2">
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
            <h2 className="font-medium text-[#2E2A24]">Mailing address</h2>
            {address ? (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs font-mono text-[#2E2A24]">
                {JSON.stringify(address, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-[#5C564D]">No address on file.</p>
            )}
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium text-[#2E2A24]">Snail</h2>
              {snail?.id ? (
                <Link
                  href={`/snails/mirrors/${encodeURIComponent(String(snail.id))}`}
                  className="text-sm text-[#4F6E43] hover:underline"
                >
                  Open snail →
                </Link>
              ) : null}
            </div>
            {snail ? (
              <pre className="mt-3 overflow-x-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs font-mono text-[#2E2A24]">
                {JSON.stringify(snail, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-sm text-[#5C564D]">No snail payload.</p>
            )}
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5 lg:col-span-2">
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
