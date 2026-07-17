"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PrintingSubnav } from "@/components/printing/printing-subnav";
import { LobCredentialsSection } from "@/components/printing/lob-credentials-section";
import { apiFetch, apiJson } from "@/lib/api-fetch";
import {
  DEFAULT_LOB_FULFILLMENT_SETTINGS,
  DEFAULT_LOB_THANK_YOU_MESSAGE,
  LOB_PRODUCT_LABELS,
  missingReturnAddressFields,
  returnAddressValidationMessage,
  type LobFulfillmentSettings,
  type LobLetterFormatSettings,
  type LobProductType,
  type ReturnAddressRequiredField,
} from "@/lib/lob-fulfillment-settings";
import { POSTCARDS_COVER_PAGE, POSTCARDS_PER_CONTENT_PAGE } from "@/lib/build-lob-letter-html";

const RETURN_ADDRESS_FIELDS: {
  key: keyof LobFulfillmentSettings["returnAddress"];
  label: string;
  required: boolean;
}[] = [
  { key: "name", label: "Name / company", required: true },
  { key: "line1", label: "Address line 1", required: true },
  { key: "line2", label: "Address line 2", required: false },
  { key: "city", label: "City", required: true },
  { key: "state", label: "State", required: true },
  { key: "zip", label: "ZIP", required: true },
  { key: "country", label: "Country", required: false },
];

export default function LobSettingsPage() {
  const [settings, setSettings] = useState<LobFulfillmentSettings | null>(null);
  const [lastAutoRunAt, setLastAutoRunAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processMsg, setProcessMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processorStats, setProcessorStats] = useState<{
    lastRunAt: string | null;
    lastRunStats: Record<string, unknown> | null;
    scanResumeAfterPath: string | null;
  } | null>(null);
  const returnAddressRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const [data, processor] = await Promise.all([
        apiJson<{
          settings: LobFulfillmentSettings;
          lastAutoRunAt?: string;
        }>("/api/printing/lob-settings"),
        apiJson<{
          processor: {
            lastRunAt: string | null;
            lastRunStats: Record<string, unknown> | null;
            scanResumeAfterPath: string | null;
          };
        }>("/api/printing/processor-status").catch(() => null),
      ]);
      setSettings(data.settings);
      setLastAutoRunAt(data.lastAutoRunAt ?? null);
      setProcessorStats(processor?.processor ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setSettings({ ...DEFAULT_LOB_FULFILLMENT_SETTINGS, returnAddress: { ...DEFAULT_LOB_FULFILLMENT_SETTINGS.returnAddress } });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(patch: Partial<LobFulfillmentSettings>) {
    setSaveError(null);
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function updateReturnAddress(patch: Partial<LobFulfillmentSettings["returnAddress"]>) {
    setSaveError(null);
    setSettings((prev) =>
      prev ? { ...prev, returnAddress: { ...prev.returnAddress, ...patch } } : prev,
    );
  }

  function updateLetterFormat(patch: Partial<LobLetterFormatSettings>) {
    setSaveError(null);
    setSettings((prev) =>
      prev ? { ...prev, letterFormat: { ...prev.letterFormat, ...patch } } : prev,
    );
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch("/api/printing/lob-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
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
        if (msg.includes("Return address")) {
          returnAddressRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        throw new Error(msg);
      }
      const j = JSON.parse(text) as { settings: LobFulfillmentSettings };
      setSettings(j.settings);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runAutoProcessor() {
    setProcessing(true);
    setProcessMsg(null);
    try {
      const res = await apiFetch("/api/printing/process-auto?force=1", { method: "POST" });
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
        ran?: boolean;
        reason?: string;
        telemetry?: {
          unprintedAwaitingCount?: number;
          eligibleRecipients?: number;
          candidateCount?: number;
          submitted?: number;
          skipped?: number;
          failed?: number;
          warnings?: string[];
        };
        submit?: { submitted?: number; skipped?: number; failed?: number };
      };
      if (!j.ran) {
        const t = j.telemetry;
        const extra = t
          ? ` · ${t.unprintedAwaitingCount ?? 0} awaiting-print, ${t.eligibleRecipients ?? 0} eligible`
          : "";
        setProcessMsg((j.reason ?? "Auto processor did not run") + extra);
      } else {
        const submitted = j.submit?.submitted ?? j.telemetry?.submitted ?? 0;
        const skipped = j.submit?.skipped ?? j.telemetry?.skipped ?? 0;
        const failed = j.submit?.failed ?? j.telemetry?.failed ?? 0;
        setProcessMsg(`Submitted ${submitted}, skipped ${skipped}, failed ${failed}`);
      }
      await load();
    } catch (e) {
      setProcessMsg(e instanceof Error ? e.message : "Process failed");
    } finally {
      setProcessing(false);
    }
  }

  const s = settings;
  const missingReturnFields: ReturnAddressRequiredField[] = s?.lobEnabled
    ? missingReturnAddressFields(s.returnAddress)
    : [];
  const returnAddressHint = s ? returnAddressValidationMessage(s) : null;
  const highlightReturnFields = Boolean(s?.lobEnabled && (saveError || missingReturnFields.length > 0));

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#2E2A24]">Lob fulfillment settings</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5C564D]">
            Configure when Snail Mail sends physical mail through Lob instead of in-house printing.
            Stored in Firestore at <code className="text-xs">adminSettings/lobFulfillment</code>.
          </p>
        </div>
        <PrintingSubnav />
      </header>

      {loadError ? <p className="text-sm text-amber-800">{loadError}</p> : null}
      {saveError ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-semibold">Could not save settings</p>
          <p className="mt-1">{saveError}</p>
          {saveError.includes("Return address") ? (
            <p className="mt-2 text-red-800">
              Scroll to <strong>Return address (from)</strong> below and complete the highlighted fields.
            </p>
          ) : null}
        </div>
      ) : null}
      {returnAddressHint && !saveError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {returnAddressHint}
        </div>
      ) : null}
      {processMsg ? <p className="text-sm text-[#4F6E43]">{processMsg}</p> : null}

      {busy && !s ? (
        <p className="text-sm text-[#5C564D]">Loading…</p>
      ) : s ? (
        <div className="space-y-8">
          <LobCredentialsSection />

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-[#2E2A24]">Provider</h2>
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={s.lobEnabled}
                  onChange={(e) => update({ lobEnabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
                />
                <span>
                  <strong>Use Lob for fulfillment</strong> — when off, use legacy in-house browser printing
                </span>
              </label>
              {s.lobEnabled ? (
                <p className="text-sm text-amber-900/90">
                  Requires a complete <strong>return address</strong> below before you can save.
                </p>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="font-medium text-[#2E2A24]">Lob environment</span>
                  <select
                    value={s.lobEnvironment}
                    onChange={(e) => update({ lobEnvironment: e.target.value as "test" | "live" })}
                    className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                  >
                    <option value="test">Test</option>
                    <option value="live">Live</option>
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="font-medium text-[#2E2A24]">Product type</span>
                  <select
                    value={s.productType}
                    onChange={(e) => update({ productType: e.target.value as LobProductType })}
                    className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                  >
                    {(Object.keys(LOB_PRODUCT_LABELS) as LobProductType[]).map((key) => (
                      <option key={key} value={key} disabled={key === "postcard_4x6"}>
                        {LOB_PRODUCT_LABELS[key]}
                        {key === "postcard_4x6" ? " (coming soon)" : ""}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-[#5C564D]">
                    Start with US Letter — bundles queued postcards into a mailed letter.
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-[#2E2A24]">Automatic sending</h2>
            <p className="mt-1 text-sm text-[#5C564D]">
              Physical postcards enter the print queue as soon as friends send mail (status{" "}
              <code className="text-xs">awaiting_print</code> for Pro subscribers). Auto-send submits Lob
              mailings when a recipient&apos;s queue reaches your post threshold — manual{" "}
              <strong>Send to Lob</strong> from the Printing page ignores the threshold.
              {lastAutoRunAt ? (
                <span className="mt-1 block">
                  Last auto run: <time dateTime={lastAutoRunAt}>{new Date(lastAutoRunAt).toLocaleString()}</time>
                </span>
              ) : null}
            </p>

            {(() => {
              const autoSendOn = s.autoSendMode !== "disabled";
              const throttleRuns = s.autoSendMode === "scheduled_batch";
              const exampleLetterPosts =
                POSTCARDS_COVER_PAGE + POSTCARDS_PER_CONTENT_PAGE * 3;

              return (
                <div className="mt-4 space-y-4">
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={autoSendOn}
                      onChange={(e) =>
                        update({
                          autoSendMode: e.target.checked
                            ? throttleRuns
                              ? "scheduled_batch"
                              : "immediate"
                            : "disabled",
                        })
                      }
                      className="mt-0.5 h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
                    />
                    <span>
                      <span className="font-medium text-[#2E2A24]">Enable automatic Lob sending</span>
                      <span className="mt-0.5 block text-xs text-[#5C564D]">
                        Cloud Function checks every 5 minutes and submits eligible recipients to Lob.
                      </span>
                    </span>
                  </label>

                  {autoSendOn ? (
                    <>
                      <label className="block max-w-xs text-sm">
                        <span className="font-medium text-[#2E2A24]">Posts before auto-send</span>
                        <input
                          type="number"
                          min={1}
                          value={s.batchMinQueuedCards}
                          onChange={(e) => update({ batchMinQueuedCards: Number(e.target.value) })}
                          className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                        />
                        <span className="mt-1 block text-xs text-[#5C564D]">
                          Auto-send when a recipient has at least this many physical postcards waiting.
                          Default {exampleLetterPosts} fills one US letter (cover + 3 inside pages).{" "}
                          <strong>All</strong> queued postcards are mailed, not just this number. Use a
                          lower value while testing.
                        </span>
                      </label>

                      <label className="flex items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={throttleRuns}
                          onChange={(e) =>
                            update({
                              autoSendMode: e.target.checked ? "scheduled_batch" : "immediate",
                            })
                          }
                          className="mt-0.5 h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
                        />
                        <span>
                          <span className="font-medium text-[#2E2A24]">Throttle auto-send runs</span>
                          <span className="mt-0.5 block text-xs text-[#5C564D]">
                            Optional. When off, eligible recipients are sent on the next 5-minute check.
                            When on, wait at least the interval below between runs that actually submit to
                            Lob.
                          </span>
                        </span>
                      </label>

                      {throttleRuns ? (
                        <label className="block max-w-xs text-sm">
                          <span className="font-medium text-[#2E2A24]">Minimum minutes between send runs</span>
                          <input
                            type="number"
                            min={5}
                            value={s.batchIntervalMinutes}
                            onChange={(e) => update({ batchIntervalMinutes: Number(e.target.value) })}
                            className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                          />
                        </label>
                      ) : null}

                      <details className="rounded-lg border border-[#C8D5B9]/50 bg-[#FDFBF7] px-4 py-3 text-sm">
                        <summary className="cursor-pointer font-medium text-[#2E2A24]">Advanced limits</summary>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm">
                            <span className="font-medium text-[#2E2A24]">Max recipients per auto run</span>
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={s.batchMaxRecipientsPerRun}
                              onChange={(e) =>
                                update({ batchMaxRecipientsPerRun: Number(e.target.value) })
                              }
                              className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                            />
                            <span className="mt-1 block text-xs text-[#5C564D]">
                              Safety cap when many people hit the threshold at once.
                            </span>
                          </label>
                          <label className="block text-sm">
                            <span className="font-medium text-[#2E2A24]">Submit concurrency</span>
                            <input
                              type="number"
                              min={1}
                              max={10}
                              value={s.submitConcurrency}
                              onChange={(e) => update({ submitConcurrency: Number(e.target.value) })}
                              className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                            />
                            <span className="mt-1 block text-xs text-[#5C564D]">
                              Parallel Lob API calls per run (default 3).
                            </span>
                          </label>
                        </div>
                      </details>
                    </>
                  ) : null}
                </div>
              );
            })()}

            {processorStats?.lastRunStats ? (
              <div className="mt-4 rounded-lg border border-[#C8D5B9]/50 bg-[#FDFBF7] px-4 py-3 text-xs text-[#5C564D]">
                <p className="font-semibold text-[#2E2A24]">Last processor run</p>
                <p className="mt-1">
                  {processorStats.lastRunAt
                    ? new Date(processorStats.lastRunAt).toLocaleString()
                    : "—"}
                  {" · "}
                  {String(processorStats.lastRunStats.unprintedAwaitingCount ?? "—")} awaiting-print
                  {" · "}
                  {String(processorStats.lastRunStats.eligibleRecipients ?? "—")} eligible recipients
                  {" · "}
                  {String(processorStats.lastRunStats.submitted ?? 0)} submitted
                </p>
                {processorStats.scanResumeAfterPath ? (
                  <p className="mt-1 text-amber-800">Queue scan in progress — next run will resume.</p>
                ) : null}
                {Array.isArray(processorStats.lastRunStats.warnings) &&
                processorStats.lastRunStats.warnings.length > 0 ? (
                  <p className="mt-1 text-amber-800">
                    {processorStats.lastRunStats.warnings.join(" ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            <p className="mt-4 text-xs text-[#5C564D]">
              Automatic runs are triggered by the <strong>processLobAutoPrint</strong> Cloud Function
              (every 5 minutes). Set the same <code>LOB_AUTO_CRON_SECRET</code> in App Hosting and
              Cloud Functions secrets.
            </p>

            <button
              type="button"
              disabled={processing || !s.lobEnabled}
              onClick={() => void runAutoProcessor()}
              className="mt-4 rounded-lg border border-[#4F6E43]/40 bg-[#E8EFE0] px-4 py-2 text-sm font-semibold text-[#2E2A24] hover:bg-[#dce8d0] disabled:opacity-50"
            >
              {processing ? "Processing…" : "Run auto processor now"}
            </button>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-medium text-[#2E2A24]">Letter options</h2>
            <p className="mt-1 text-sm text-[#5C564D]">
              Lob print settings and cover-page letter format. Saved with your other Lob settings.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={s.color}
                  onChange={(e) => update({ color: e.target.checked })}
                  className="h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
                />
                Print in color
              </label>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={s.doubleSided}
                  onChange={(e) => update({ doubleSided: e.target.checked })}
                  className="h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
                />
                Double-sided
              </label>

              <label className="block text-sm">
                <span className="font-medium text-[#2E2A24]">Mail type</span>
                <select
                  value={s.mailType}
                  onChange={(e) =>
                    update({ mailType: e.target.value as LobFulfillmentSettings["mailType"] })
                  }
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                >
                  <option value="usps_first_class">USPS First Class</option>
                  <option value="usps_standard">USPS Standard</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="font-medium text-[#2E2A24]">Address placement</span>
                <select
                  value={s.addressPlacement}
                  onChange={(e) =>
                    update({ addressPlacement: e.target.value as LobFulfillmentSettings["addressPlacement"] })
                  }
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2"
                >
                  <option value="top_first_page">Top of first page</option>
                  <option value="insert_blank_page">Insert blank page</option>
                </select>
              </label>
            </div>

            <div className="mt-6 border-t border-[#E8E4DC] pt-5">
              <h3 className="text-sm font-semibold text-[#2E2A24]">Cover letter format</h3>
              <p className="mt-1 text-sm text-[#5C564D]">
                Page 1 shows the recipient&apos;s snail above your thank-you paragraph, then postcards below.
              </p>
              <label className="mt-4 flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={s.letterFormat.showRecipientSnailOnCover}
                  onChange={(e) => updateLetterFormat({ showRecipientSnailOnCover: e.target.checked })}
                  className="h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
                />
                Show recipient snail on cover
              </label>
              <label className="mt-4 block text-sm">
                <span className="font-medium text-[#2E2A24]">Thank-you paragraph</span>
                <textarea
                  value={s.letterFormat.thankYouMessage}
                  onChange={(e) => updateLetterFormat({ thankYouMessage: e.target.value })}
                  rows={5}
                  maxLength={2000}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2 text-sm leading-relaxed"
                  placeholder={DEFAULT_LOB_THANK_YOU_MESSAGE}
                />
                <span className="mt-1 block text-xs text-[#5C564D]">
                  {s.letterFormat.thankYouMessage.length}/2000 characters
                </span>
              </label>
            </div>
          </section>

          <section
            ref={returnAddressRef}
            id="return-address-section"
            className={`rounded-xl border bg-white p-6 shadow-sm ${
              highlightReturnFields ? "border-red-300 ring-2 ring-red-200" : "border-[#C8D5B9]/60"
            }`}
          >
            <h2 className="text-lg font-medium text-[#2E2A24]">
              Return address (from)
              {s.lobEnabled ? <span className="ml-2 text-sm font-normal text-red-700">Required</span> : null}
            </h2>
            <p className="mt-1 text-sm text-[#5C564D]">
              Snail Mail PO box or business return address sent to Lob as the letter sender.
            </p>
            {highlightReturnFields && missingReturnFields.length > 0 ? (
              <p className="mt-3 text-sm font-medium text-red-800">
                Missing:{" "}
                {missingReturnFields
                  .map((k) => RETURN_ADDRESS_FIELDS.find((f) => f.key === k)?.label ?? k)
                  .join(", ")}
              </p>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {RETURN_ADDRESS_FIELDS.map(({ key, label, required }) => {
                const isMissing =
                  highlightReturnFields &&
                  required &&
                  missingReturnFields.includes(key as ReturnAddressRequiredField);
                return (
                  <label
                    key={key}
                    className={`block text-sm ${key === "line1" ? "sm:col-span-2" : ""}`}
                  >
                    <span className="font-medium text-[#2E2A24]">
                      {label}
                      {s.lobEnabled && required ? (
                        <span className="text-red-600" title="Required when Lob is enabled">
                          {" "}
                          *
                        </span>
                      ) : null}
                    </span>
                    <input
                      type="text"
                      value={s.returnAddress[key] ?? ""}
                      onChange={(e) => updateReturnAddress({ [key]: e.target.value })}
                      aria-invalid={isMissing || undefined}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 ${
                        isMissing
                          ? "border-red-400 bg-red-50/50 ring-1 ring-red-300"
                          : "border-[#C8D5B9]"
                      }`}
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-[#4F6E43] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3d5634] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm hover:bg-[#F0F5EA] disabled:opacity-50"
            >
              Reload
            </button>
          </div>

        </div>
      ) : null}
    </div>
  );
}
