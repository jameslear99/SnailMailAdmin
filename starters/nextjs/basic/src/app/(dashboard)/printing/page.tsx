"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

type RecipientRow = {
  recipientUid: string;
  displayName?: string;
  username?: string;
  postsReceived: number;
  postsPhysicallyFulfilled: number;
  queueCount: number;
  adSlotsOnReceived: number;
  adSlotsOnPrinted: number;
  lastMailSentAt?: string;
};

type RecipientsMeta = {
  deliveryDocumentsRead: number;
  deliveryStatusCounts: Record<string, number>;
  distinctRecipientsWithDeliveries: number;
};

function formatLastSend(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PrintingQueuePage() {
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [meta, setMeta] = useState<RecipientsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recordBusyUid, setRecordBusyUid] = useState<string | null>(null);
  const [recordingBulk, setRecordingBulk] = useState(false);
  const [selectedUids, setSelectedUids] = useState<Set<string>>(() => new Set());
  const [showAllRecipients, setShowAllRecipients] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function goBulkPrint(uids: string[]) {
    if (uids.length === 0) return;
    const q = encodeURIComponent(uids.join(","));
    router.push(`/printing/bulk-pack?recipientUids=${q}`);
  }

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiJson<{
        recipients: RecipientRow[];
        userCap?: number;
        meta?: RecipientsMeta;
      }>("/api/printing/recipients");
      setRecipients(data.recipients);
      setMeta(data.meta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRecipients([]);
      setMeta(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const { needsPrint, caughtUp } = useMemo(() => {
    const needs: RecipientRow[] = [];
    const rest: RecipientRow[] = [];
    for (const r of recipients) {
      if (r.queueCount > 0) needs.push(r);
      else rest.push(r);
    }
    needs.sort((a, b) => b.queueCount - a.queueCount);
    return { needsPrint: needs, caughtUp: rest };
  }, [recipients]);

  const totalCardsWaiting = useMemo(
    () => needsPrint.reduce((sum, r) => sum + r.queueCount, 0),
    [needsPrint],
  );

  const selectedRows = useMemo(
    () => needsPrint.filter((r) => selectedUids.has(r.recipientUid)),
    [needsPrint, selectedUids],
  );

  const selectedCardsCount = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.queueCount, 0),
    [selectedRows],
  );

  const allQueueSelected =
    needsPrint.length > 0 && selectedRows.length === needsPrint.length;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = selectedRows.length > 0 && !allQueueSelected;
  }, [selectedRows.length, allQueueSelected]);

  function toggleRowSelected(recipientUid: string, checked: boolean) {
    setSelectedUids((prev) => {
      const next = new Set(prev);
      if (checked) next.add(recipientUid);
      else next.delete(recipientUid);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedUids(new Set(needsPrint.map((r) => r.recipientUid)));
    } else {
      setSelectedUids(new Set());
    }
  }

  const recording = recordBusyUid !== null || recordingBulk;

  async function recordPrinted(recipientUid: string) {
    setRecordBusyUid(recipientUid);
    setError(null);
    try {
      const res = await fetch("/api/printing/mark-fulfilled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUid }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* */
        }
        throw new Error(msg);
      }
      setSelectedUids((prev) => {
        const next = new Set(prev);
        next.delete(recipientUid);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRecordBusyUid(null);
    }
  }

  async function recordBulkPrinted(uids: string[]) {
    if (uids.length === 0) return;
    setRecordingBulk(true);
    setError(null);
    try {
      const res = await fetch("/api/printing/mark-fulfilled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUids: uids }),
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* */
        }
        throw new Error(msg);
      }
      setSelectedUids(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRecordingBulk(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2E2A24]">Printing</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5C564D]">
            As soon as someone sends mail from the app, each recipient&apos;s postcard appears here until you
            <strong> record it as printed/shipped</strong> — you do <strong>not</strong> wait for the in-app digital
            unlock. <strong>Print</strong> opens a combined pack for all postcards in order (one print dialog). Use{" "}
            <strong>Record all queued</strong> (or per row) after the physical run. The list also refreshes about every
            30 seconds while
            this tab is open, or use{" "}
            <strong>Refresh</strong>.{" "}
            <Link href="/printing/batches" className="text-[#4F6E43] hover:underline">
              Browse batches
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="shrink-0 self-start rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm hover:bg-[#F0F5EA] disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="whitespace-pre-wrap text-sm text-red-700">{error}</p> : null}

      {meta ? (
        <div className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] px-4 py-3 text-sm text-[#5C564D]">
          <p className="font-medium text-[#2E2A24]">Fulfillment data (Firestore)</p>
          <p className="mt-1">
            <strong>{meta.deliveryDocumentsRead}</strong> per-recipient delivery row(s) read ·{" "}
            <strong>{meta.distinctRecipientsWithDeliveries}</strong> recipient id(s) touched · status mix:{" "}
            {Object.keys(meta.deliveryStatusCounts).length === 0 ? (
              <span>—</span>
            ) : (
              <span className="font-mono text-xs">
                {Object.entries(meta.deliveryStatusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </span>
            )}
          </p>
          {meta.deliveryDocumentsRead === 0 ? (
            <p className="mt-3 text-amber-900/90">
              No <code className="text-xs">mailPosts/&#123;id&#125;/deliveries</code> documents exist yet. The Flutter
              app only creates the parent <code className="text-xs">mailPosts</code> doc — per-recipient rows are
              created by the <strong>onMailPostCreated</strong> Cloud Function. Deploy functions, send a <strong>new</strong>{" "}
              post, then check Firebase for a <code className="text-xs">deliveries</code> subcollection. Confirm the
              Admin service account uses the <strong>same Firebase project</strong> as the app.
            </p>
          ) : null}
        </div>
      ) : null}

      {busy && recipients.length === 0 ? (
        <p className="text-sm text-[#5C564D]">Loading…</p>
      ) : null}

      {!busy || recipients.length > 0 ? (
        <>
          <section className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-medium text-[#2E2A24]">Ready to print</h2>
              {needsPrint.length > 0 ? (
                <span className="text-sm text-[#5C564D]">
                  {needsPrint.length} recipient{needsPrint.length === 1 ? "" : "s"} · {totalCardsWaiting} card
                  {totalCardsWaiting === 1 ? "" : "s"} queued
                </span>
              ) : (
                <span className="text-sm text-[#5C564D]">No postcards waiting — you&apos;re all caught up.</span>
              )}
            </div>

            {needsPrint.length > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#C8D5B9]/60 bg-white px-3 py-2 text-sm shadow-sm">
                  <div className="text-[#5C564D]">
                    {selectedRows.length === 0 ? (
                      <span>Select recipients to print together, or use </span>
                    ) : (
                      <span>
                        <strong className="text-[#2E2A24]">{selectedRows.length}</strong> recipient
                        {selectedRows.length === 1 ? "" : "s"} selected ·{" "}
                        <strong className="text-[#2E2A24]">{selectedCardsCount}</strong> card
                        {selectedCardsCount === 1 ? "" : "s"} in combined print order
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={recording || needsPrint.length === 0}
                      onClick={() => toggleSelectAll(!allQueueSelected)}
                      className="ml-1 font-medium text-[#4F6E43] underline decoration-[#C8D5B9] underline-offset-2 hover:decoration-[#4F6E43] disabled:opacity-50"
                    >
                      {allQueueSelected ? "Clear selection" : "Select all in queue"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={recording || selectedRows.length === 0}
                      onClick={() => goBulkPrint(selectedRows.map((r) => r.recipientUid))}
                      className="rounded-lg bg-[#4F6E43] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3d5634] disabled:opacity-50"
                    >
                      {`Print${selectedRows.length ? ` (${selectedRows.length})` : ""}`}
                    </button>
                    <button
                      type="button"
                      disabled={recording || needsPrint.length === 0}
                      onClick={() => goBulkPrint(needsPrint.map((r) => r.recipientUid))}
                      className="rounded-lg border border-[#4F6E43]/40 bg-[#E8EFE0] px-3 py-1.5 text-xs font-semibold text-[#2E2A24] hover:bg-[#dce8d0] disabled:opacity-50"
                    >
                      Print all queued
                    </button>
                    <button
                      type="button"
                      disabled={recording || selectedRows.length === 0}
                      onClick={() => void recordBulkPrinted(selectedRows.map((r) => r.recipientUid))}
                      className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-1.5 text-xs font-semibold text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-50"
                    >
                      {recordingBulk
                        ? "Recording…"
                        : `Record selected${selectedRows.length ? ` (${selectedRows.length})` : ""}`}
                    </button>
                    <button
                      type="button"
                      disabled={recording || needsPrint.length === 0}
                      onClick={() => void recordBulkPrinted(needsPrint.map((r) => r.recipientUid))}
                      className="rounded-lg border border-[#C8D5B9] bg-[#FDFBF7] px-3 py-1.5 text-xs font-semibold text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-50"
                    >
                      {recordingBulk ? "Recording…" : "Record all queued"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-[#C8D5B9]/60 bg-[#FDFBF7] shadow-sm ring-1 ring-[#C8D5B9]/20">
                  <table className="w-full min-w-[46rem] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#C8D5B9]/60 bg-[#FDFBF7]/90 text-[10px] font-semibold uppercase tracking-wide text-[#5C564D]">
                        <th className="w-10 whitespace-nowrap px-2 py-1.5 text-center" title="Select for bulk record">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-[#C8D5B9] text-[#4F6E43] accent-[#4F6E43] disabled:opacity-50"
                            checked={allQueueSelected}
                            disabled={recording || needsPrint.length === 0}
                            onChange={(e) => toggleSelectAll(e.target.checked)}
                            aria-label="Select all recipients in queue"
                          />
                        </th>
                        <th className="whitespace-nowrap px-2 py-1.5">Queue</th>
                        <th
                          className="whitespace-nowrap px-2 py-1.5 text-right"
                          title="Postcards already marked printed / shipped"
                        >
                          Already mailed
                        </th>
                        <th
                          className="whitespace-nowrap px-2 py-1.5"
                          title="Most recent delivery fan-out (when the send was recorded)"
                        >
                          Last send
                        </th>
                        <th className="min-w-0 px-2 py-1.5">Recipient</th>
                        <th className="whitespace-nowrap px-2 py-1.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#C8D5B9]/30 text-[#2E2A24]">
                      {needsPrint.map((r) => (
                        <tr key={r.recipientUid} className="align-middle">
                          <td className="whitespace-nowrap px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-[#C8D5B9] text-[#4F6E43] accent-[#4F6E43] disabled:opacity-50"
                              checked={selectedUids.has(r.recipientUid)}
                              disabled={recording}
                              onChange={(e) => toggleRowSelected(r.recipientUid, e.target.checked)}
                              aria-label={`Select ${r.displayName ?? r.recipientUid} for bulk record`}
                            />
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            <span className="inline-block min-w-[1.75rem] rounded-md bg-amber-100/90 px-1.5 py-0.5 text-center text-sm font-semibold tabular-nums text-amber-950">
                              {r.queueCount}
                            </span>
                          </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-[#5C564D]">
                          {r.postsPhysicallyFulfilled}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-[#5C564D]">
                          {formatLastSend(r.lastMailSentAt)}
                        </td>
                        <td className="max-w-[14rem] min-w-0 px-2 py-1.5">
                          <div
                            className="truncate font-medium"
                            title={
                              [r.displayName ?? "Unknown", r.username ? `@${r.username}` : ""].filter(Boolean).join(" ")
                            }
                          >
                            {r.displayName ?? "Unknown name"}
                            {r.username ? <span className="font-normal text-[#5C564D]"> · @{r.username}</span> : null}
                          </div>
                          <Link
                            href={`/users/${encodeURIComponent(r.recipientUid)}`}
                            className="mt-0.5 block truncate font-mono text-[10px] text-[#4F6E43] hover:underline"
                            title={r.recipientUid}
                          >
                            {r.recipientUid.length > 18 ? `${r.recipientUid.slice(0, 16)}…` : r.recipientUid}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-right">
                          <div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end sm:gap-2">
                            <Link
                              href={`/printing/pack/${encodeURIComponent(r.recipientUid)}`}
                              className="inline-flex items-center justify-center rounded-md bg-[#4F6E43] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#3d5634]"
                            >
                              Print mail
                            </Link>
                            <button
                              type="button"
                              disabled={recording}
                              onClick={() => void recordPrinted(r.recipientUid)}
                              className="text-[11px] font-medium text-[#4F6E43] underline decoration-[#C8D5B9] underline-offset-2 hover:decoration-[#4F6E43] disabled:opacity-50"
                            >
                              {recordBusyUid === r.recipientUid ? "Recording…" : "Record printed"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#C8D5B9] bg-[#FDFBF7]/50 px-6 py-10 text-center">
                <p className="text-[#5C564D]">
                  When users have received digital posts that aren&apos;t marked as physically printed/shipped yet,
                  they&apos;ll show up here.
                </p>
              </div>
            )}
          </section>

          {caughtUp.length > 0 ? (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setShowAllRecipients((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-[#4F6E43] hover:underline"
              >
                {showAllRecipients ? "Hide" : "Show"} recipients with nothing to print ({caughtUp.length})
              </button>

              {showAllRecipients ? (
                <ul className="divide-y divide-[#C8D5B9]/40 rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7]">
                  {caughtUp.map((r) => (
                    <li key={r.recipientUid} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium text-[#2E2A24]">{r.displayName ?? "—"}</span>
                        {r.username ? (
                          <span className="text-[#5C564D]"> · @{r.username}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#5C564D]">
                        <span className="tabular-nums">Queue 0</span>
                        <Link href={`/users/${encodeURIComponent(r.recipientUid)}`} className="text-[#4F6E43] hover:underline">
                          Profile
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
