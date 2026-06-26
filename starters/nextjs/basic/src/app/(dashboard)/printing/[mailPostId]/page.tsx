"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

type DeliveryRow = Record<string, unknown> & { id: string };

export default function PrintingDetailPage() {
  const params = useParams();
  const mailPostId = decodeURIComponent(String(params.mailPostId ?? ""));
  const [post, setPost] = useState<Record<string, unknown> | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mailPostId) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Record<string, unknown> & { deliveries: DeliveryRow[] }>(
          `/api/mail-posts/${encodeURIComponent(mailPostId)}`,
        );
        if (cancelled) return;
        const { deliveries: d, ...rest } = data;
        setPost(rest);
        setDeliveries(d ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mailPostId]);

  const frontUrl =
    typeof post?.renderedFrontImageUrl === "string" ? post.renderedFrontImageUrl : null;

  return (
    <div className="space-y-6">
      <p>
        <Link href="/printing/batches" className="text-sm text-[#4F6E43] hover:underline">
          ← Mail batches
        </Link>
        {" · "}
        <Link href="/printing" className="text-sm text-[#4F6E43] hover:underline">
          ← Printing
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-[#2E2A24]">Mail post {mailPostId}</h1>
      {error ? <p className="text-red-700">{error}</p> : null}
      {!post && !error ? <p className="text-[#5C564D]">Loading…</p> : null}

      {post ? (
        <>
          <section className="grid gap-6 lg:grid-cols-2 rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <div>
              <h2 className="font-medium text-[#2E2A24]">Batch summary</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Sender uid" value={String(post.senderUserId ?? "—")} mono />
                <Row label="Snail" value={String(post.senderSnailName ?? "—")} />
                <Row label="Status" value={String(post.status ?? "—")} />
                <Row label="Sent at" value={formatMaybe(post.sentAt)} />
                <Row label="Digital unlock (batch)" value={formatMaybe(post.digitalUnlockAt)} />
                <Row label="Body" value={String(post.bodyText ?? "").slice(0, 280) || "—"} />
              </dl>
              {post.senderUserId ? (
                <p className="mt-3 text-sm">
                  <Link
                    href={`/users/${encodeURIComponent(String(post.senderUserId))}`}
                    className="text-[#4F6E43] hover:underline"
                  >
                    Open sender profile →
                  </Link>
                </p>
              ) : null}
            </div>
            <div>
              <h2 className="font-medium text-[#2E2A24]">Front render</h2>
              {frontUrl ? (
                <div className="mt-3 relative aspect-[3/2] h-40 w-full max-w-md overflow-hidden rounded-lg border border-[#C8D5B9]/60 bg-[#fff] sm:h-56">
                  <Image src={frontUrl} alt="Postcard front" fill className="object-cover" unoptimized />
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#5C564D]">No image URL on this batch.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Deliveries ({deliveries.length})</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[#C8D5B9]/60 text-xs uppercase tracking-wide text-[#5C564D]">
                  <tr>
                    <th className="px-2 py-2 font-medium">Recipient</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Digital</th>
                    <th className="px-2 py-2 font-medium">Physical (in-house)</th>
                    <th className="px-2 py-2 font-medium">Unlock at</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-t border-[#C8D5B9]/40 align-top">
                      <td className="px-2 py-2 font-mono text-xs">
                        {d.recipientUserId ? (
                          <Link
                            href={`/users/${encodeURIComponent(String(d.recipientUserId))}`}
                            className="text-[#4F6E43] hover:underline"
                          >
                            {String(d.recipientUserId).slice(0, 10)}…
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">{String(d.deliveryStatus ?? "—")}</td>
                      <td className="px-2 py-2 text-xs">
                        {d.isDigitallyUnlocked === true ? "unlocked" : "locked"}
                      </td>
                      <td className="px-2 py-2 text-xs text-[#5C564D]">
                        {formatMaybe(d.physicalPrintedAt)}
                      </td>
                      <td className="px-2 py-2 text-xs text-[#5C564D]">
                        {formatMaybe(d.digitalUnlockAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Raw parent document</h2>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs font-mono text-[#2E2A24]">
              {JSON.stringify(post, null, 2)}
            </pre>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-[#5C564D]">{label}</dt>
      <dd className={`min-w-0 text-[#2E2A24] ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}

function formatMaybe(v: unknown) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    return v;
  }
  return String(v);
}
