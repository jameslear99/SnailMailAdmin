"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

type MailPostRow = {
  id: string;
  senderUserId?: string;
  senderSnailName?: string;
  status?: string;
  sentAt?: string;
  recipientCount?: number;
  bodyText?: string;
};

export default function PrintingBatchesPage() {
  const [rows, setRows] = useState<MailPostRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (cursor?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "25" });
      if (cursor) params.set("cursor", cursor);
      const data = await apiJson<{ mailPosts: MailPostRow[]; nextCursor: string | null }>(
        `/api/mail-posts?${params}`,
      );
      if (cursor) {
        setRows((prev) => [...prev, ...data.mailPosts]);
      } else {
        setRows(data.mailPosts);
      }
      setNextCursor(data.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <p>
        <Link href="/printing" className="text-sm text-[#4F6E43] hover:underline">
          ← Printing (by user)
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold text-[#2E2A24]">Mail batches</h1>
        <p className="mt-1 text-[#5C564D]">
          Sender batches in <code className="text-xs">mailPosts</code> — open a row for per-recipient delivery docs.
        </p>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#C8D5B9]/60 text-xs uppercase tracking-wide text-[#5C564D]">
            <tr>
              <th className="px-4 py-3 font-medium">Mail post</th>
              <th className="px-4 py-3 font-medium">Sent</th>
              <th className="px-4 py-3 font-medium">Sender</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Recipients</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#C8D5B9]/40">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link
                    href={`/printing/${encodeURIComponent(r.id)}`}
                    className="text-[#4F6E43] hover:underline"
                  >
                    {r.id.slice(0, 12)}…
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-[#5C564D]">
                  {r.sentAt ? formatIso(r.sentAt) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="text-[#2E2A24]">{r.senderSnailName ?? "—"}</div>
                  {r.senderUserId ? (
                    <Link
                      href={`/users/${encodeURIComponent(r.senderUserId)}`}
                      className="font-mono text-xs text-[#4F6E43] hover:underline"
                    >
                      {r.senderUserId.slice(0, 8)}…
                    </Link>
                  ) : null}
                </td>
                <td className="px-4 py-3">{r.status ?? "—"}</td>
                <td className="px-4 py-3">{r.recipientCount ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !busy ? (
          <p className="px-4 py-8 text-center text-[#5C564D]">No batches yet.</p>
        ) : null}
      </div>

      {nextCursor ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(nextCursor)}
          className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-60"
        >
          {busy ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

function formatIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
