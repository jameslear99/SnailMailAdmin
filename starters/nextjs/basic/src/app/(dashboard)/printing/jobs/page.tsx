"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PrintingSubnav } from "@/components/printing/printing-subnav";
import { apiFetch, apiJson } from "@/lib/api-fetch";
import type { LobFulfillmentSettings } from "@/lib/lob-fulfillment-settings";
import { LOB_PRODUCT_LABELS } from "@/lib/lob-fulfillment-settings";
import type { PrintJobRecord, PrintJobStatus } from "@/lib/print-job";

const STATUS_STYLES: Record<PrintJobStatus, string> = {
  pending: "bg-slate-100 text-slate-800",
  submitted: "bg-blue-100 text-blue-900",
  in_production: "bg-amber-100 text-amber-950",
  mailed: "bg-green-100 text-green-900",
  failed: "bg-red-100 text-red-900",
  cancelled: "bg-neutral-100 text-neutral-600",
};

function formatWhen(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PrintJobsPage() {
  const [jobs, setJobs] = useState<PrintJobRecord[]>([]);
  const [settings, setSettings] = useState<LobFulfillmentSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resubmittingJobId, setResubmittingJobId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const jobsPath = statusFilter
        ? `/api/printing/jobs?status=${encodeURIComponent(statusFilter)}`
        : "/api/printing/jobs";
      const [jobsData, settingsData] = await Promise.all([
        apiJson<{ jobs: PrintJobRecord[] }>(jobsPath),
        apiJson<{ settings: LobFulfillmentSettings }>("/api/printing/lob-settings"),
      ]);
      setJobs(jobsData.jobs);
      setSettings(settingsData.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setJobs([]);
    } finally {
      setBusy(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!settings?.lobEnabled || settings.autoSendMode === "disabled") return;
    const intervalMs =
      settings.autoSendMode === "immediate"
        ? 2 * 60_000
        : Math.max(60_000, (settings.batchIntervalMinutes || 60) * 60_000);
    const id = window.setInterval(() => {
      void apiFetch("/api/printing/process-auto", { method: "POST" }).then(() => load());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [settings?.lobEnabled, settings?.autoSendMode, settings?.batchIntervalMinutes, load]);

  const counts = useMemo(() => {
    const m: Partial<Record<PrintJobStatus, number>> = {};
    for (const j of jobs) {
      m[j.status] = (m[j.status] ?? 0) + 1;
    }
    return m;
  }, [jobs]);

  async function retryFailed(recipientUid: string) {
    setProcessing(true);
    setActionMsg(null);
    try {
      const res = await apiFetch("/api/printing/lob-submit", {
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
      const j = JSON.parse(text) as { submitted?: number; failed?: number };
      setActionMsg(`Retry: submitted ${j.submitted ?? 0}, failed ${j.failed ?? 0}`);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setProcessing(false);
    }
  }

  const RESUBMIT_STATUSES: PrintJobStatus[] = ["submitted", "in_production", "mailed"];

  async function resubmitJob(jobId: string) {
    setResubmittingJobId(jobId);
    setActionMsg(null);
    try {
      const res = await apiFetch("/api/printing/lob-resubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
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
      const j = JSON.parse(text) as {
        submitted?: number;
        failed?: number;
        results?: Array<{ lobLetterId?: string; reason?: string; status?: string }>;
      };
      const result = j.results?.[0];
      if ((j.failed ?? 0) > 0) {
        setActionMsg(result?.reason ?? `Resubmit failed`);
      } else if (result?.lobLetterId) {
        setActionMsg(`Resubmitted → ${result.lobLetterId}`);
      } else {
        setActionMsg(`Resubmit: submitted ${j.submitted ?? 0}, failed ${j.failed ?? 0}`);
      }
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Resubmit failed");
    } finally {
      setResubmittingJobId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#2E2A24]">Print jobs</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#5C564D]">
              All Lob print &amp; mail jobs submitted from Snail Mail. Each job bundles one recipient&apos;s
              queued postcards into a {settings ? LOB_PRODUCT_LABELS[settings.productType] : "letter"}.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="shrink-0 rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm hover:bg-[#F0F5EA] disabled:opacity-50"
          >
            Refresh
          </button>
        </div>
        <PrintingSubnav />
      </header>

      {settings && !settings.lobEnabled ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Lob fulfillment is disabled. Enable it in{" "}
          <Link href="/printing/settings" className="font-medium underline">
            Lob settings
          </Link>{" "}
          or use the legacy in-house queue.
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {actionMsg ? <p className="text-sm text-[#4F6E43]">{actionMsg}</p> : null}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-[#5C564D]">Filter status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[#C8D5B9] px-2 py-1"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
            <option value="in_production">In production</option>
            <option value="mailed">Mailed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        {Object.keys(counts).length > 0 ? (
          <span className="text-xs text-[#5C564D]">
            {Object.entries(counts)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </span>
        ) : null}
      </div>

      {busy && jobs.length === 0 ? (
        <p className="text-sm text-[#5C564D]">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#C8D5B9] bg-[#FDFBF7]/50 px-6 py-10 text-center text-sm text-[#5C564D]">
          No print jobs yet. Submit from the{" "}
          <Link href="/printing" className="text-[#4F6E43] hover:underline">
            printing queue
          </Link>{" "}
          or enable automatic sending in settings.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#C8D5B9]/60 bg-[#FDFBF7] shadow-sm">
          <table className="w-full min-w-[52rem] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#C8D5B9]/60 bg-[#FDFBF7]/90 text-[10px] font-semibold uppercase tracking-wide text-[#5C564D]">
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Recipient</th>
                <th className="px-3 py-2 text-center">Cards</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Trigger</th>
                <th className="px-3 py-2">Lob</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#C8D5B9]/30 text-[#2E2A24]">
              {jobs.map((j) => (
                <tr key={j.id} className="align-middle">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#5C564D]">
                    {formatWhen(j.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[j.status]}`}
                    >
                      {j.status.replace("_", " ")}
                    </span>
                    {j.errorMessage ? (
                      <p className="mt-1 max-w-[12rem] truncate text-[10px] text-red-700" title={j.errorMessage}>
                        {j.errorMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="max-w-[12rem] px-3 py-2">
                    <div className="truncate font-medium">{j.recipientDisplayName ?? "—"}</div>
                    <Link
                      href={`/users/${encodeURIComponent(j.recipientUid)}`}
                      className="font-mono text-[10px] text-[#4F6E43] hover:underline"
                    >
                      {j.recipientUid.slice(0, 14)}…
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{j.cardCount}</td>
                  <td className="px-3 py-2">{LOB_PRODUCT_LABELS[j.productType]}</td>
                  <td className="px-3 py-2 capitalize">{j.trigger}</td>
                  <td className="px-3 py-2">
                    {j.lobLetterId ? (
                      <div>
                        <span className="font-mono text-[10px]">{j.lobLetterId}</span>
                        {j.lobUrl ? (
                          <a
                            href={j.lobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 block text-[10px] text-[#4F6E43] hover:underline"
                          >
                            Preview
                          </a>
                        ) : null}
                        {j.lobTrackingNumber ? (
                          <span className="mt-0.5 block text-[10px] text-[#5C564D]">
                            Track: {j.lobTrackingNumber}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {RESUBMIT_STATUSES.includes(j.status) ? (
                        <button
                          type="button"
                          disabled={resubmittingJobId !== null || processing}
                          onClick={() => void resubmitJob(j.id)}
                          className="text-[11px] font-medium text-[#4F6E43] underline disabled:opacity-50"
                        >
                          {resubmittingJobId === j.id ? "Resubmitting…" : "Resubmit"}
                        </button>
                      ) : null}
                      {j.status === "failed" ? (
                        <button
                          type="button"
                          disabled={processing || resubmittingJobId !== null}
                          onClick={() => void retryFailed(j.recipientUid)}
                          className="text-[11px] font-medium text-[#4F6E43] underline disabled:opacity-50"
                        >
                          Retry
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
