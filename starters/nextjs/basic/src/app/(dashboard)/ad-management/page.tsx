"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiJson } from "@/lib/api-fetch";
import {
  adPagesForPostCount,
  type EnvelopeAdPolicy,
  type EnvelopeAdRounding,
  type EnvelopeAdTier,
} from "@/lib/envelope-ad-policy";

const PREVIEW_POST_COUNTS = [1, 2, 3, 5, 8, 10, 12];

export default function AdManagementPage() {
  const [campaignNote, setCampaignNote] = useState<string | null>(null);
  const [policy, setPolicy] = useState<EnvelopeAdPolicy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const [camp, pol] = await Promise.all([
        apiJson<{ campaigns: unknown[]; message?: string }>("/api/ad-management/campaigns"),
        apiJson<{ policy: EnvelopeAdPolicy }>("/api/ad-management/envelope-policy"),
      ]);
      setCampaignNote(camp.message ?? null);
      setPolicy(pol.policy);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
      setPolicy(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const previewRows = useMemo(() => {
    if (!policy) return [];
    return PREVIEW_POST_COUNTS.map((n) => ({
      posts: n,
      ads: adPagesForPostCount(n, policy),
    }));
  }, [policy]);

  async function save() {
    if (!policy) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/ad-management/envelope-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
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
      const j = JSON.parse(text) as { policy: EnvelopeAdPolicy };
      setPolicy(j.policy);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function updatePolicy(p: Partial<EnvelopeAdPolicy>) {
    setPolicy((prev) => (prev ? { ...prev, ...p } : prev));
  }

  function setTier(index: number, tier: Partial<EnvelopeAdTier>) {
    if (!policy) return;
    const tiers = policy.tiers.map((t, i) => (i === index ? { ...t, ...tier } : t));
    updatePolicy({ tiers });
  }

  function addTier() {
    if (!policy) return;
    updatePolicy({
      tiers: [...policy.tiers, { minPosts: 1, maxPosts: 1, adPages: 1 }],
    });
  }

  function removeTier(index: number) {
    if (!policy) return;
    updatePolicy({ tiers: policy.tiers.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold text-[#2E2A24]">Ad Management</h1>
        <p className="mt-1 text-sm text-[#5C564D]">
          Campaign inventory and rules for how many ad pages to tuck into each mailed envelope.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#2E2A24]">Campaigns</h2>
        {busy ? (
          <p className="text-sm text-[#5C564D]">Loading…</p>
        ) : (
          <div className="rounded-lg border border-dashed border-[#C8D5B9] bg-white/60 p-8 text-center text-sm text-[#5C564D]">
            <p>No campaigns in this admin yet.</p>
            {campaignNote ? <p className="mt-2 text-xs">{campaignNote}</p> : null}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#2E2A24]">Envelope ad pages</h2>
        <p className="max-w-2xl text-sm text-[#5C564D]">
          For each shipment, we look at how many postcards are in the envelope. <strong>Optional tier rules</strong>{" "}
          run first (first matching range wins). Otherwise we use{" "}
          <strong>
            post count × ads-per-post ratio
          </strong>, then rounding, then min/max caps.
        </p>

        {loadError ? <p className="text-sm text-red-700">{loadError}</p> : null}

        {policy ? (
          <div className="max-w-3xl space-y-6 rounded-lg border border-[#C8D5B9]/60 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium text-[#2E2A24]">Ads per postcard (ratio)</span>
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  className="mt-1 w-full rounded-md border border-[#C8D5B9] px-2 py-1.5 text-[#2E2A24]"
                  value={policy.adsPerPostRatio}
                  onChange={(e) => updatePolicy({ adsPerPostRatio: Number(e.target.value) })}
                />
                <span className="mt-1 block text-xs text-[#5C564D]">e.g. 1 = one ad page per postcard, 0.5 ≈ one ad per two postcards (after rounding).</span>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[#2E2A24]">Rounding</span>
                <select
                  className="mt-1 w-full rounded-md border border-[#C8D5B9] px-2 py-1.5 text-[#2E2A24]"
                  value={policy.rounding}
                  onChange={(e) => updatePolicy({ rounding: e.target.value as EnvelopeAdRounding })}
                >
                  <option value="round">Round</option>
                  <option value="floor">Floor</option>
                  <option value="ceil">Ceil</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[#2E2A24]">Min ad pages (per envelope)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="mt-1 w-full rounded-md border border-[#C8D5B9] px-2 py-1.5 text-[#2E2A24]"
                  value={policy.minAdPages}
                  onChange={(e) => updatePolicy({ minAdPages: Number(e.target.value) })}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-[#2E2A24]">Max ad pages (per envelope)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="mt-1 w-full rounded-md border border-[#C8D5B9] px-2 py-1.5 text-[#2E2A24]"
                  value={policy.maxAdPages}
                  onChange={(e) => updatePolicy({ maxAdPages: Number(e.target.value) })}
                />
              </label>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-[#2E2A24]">Tier overrides (optional)</h3>
                <button
                  type="button"
                  onClick={addTier}
                  className="rounded-md border border-[#C8D5B9] bg-[#FDFBF7] px-2 py-1 text-xs text-[#2E2A24] hover:bg-[#F0F5EA]"
                >
                  Add rule
                </button>
              </div>
              <p className="mt-1 text-xs text-[#5C564D]">
                If postcard count is between min and max (inclusive), use the fixed ad page count. First matching row wins
                — put narrower ranges above broader ones.
              </p>
              {policy.tiers.length === 0 ? (
                <p className="mt-2 text-sm text-[#5C564D]">No tiers — ratio only.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {policy.tiers.map((t, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-end gap-2 rounded-md border border-[#C8D5B9]/50 bg-[#FDFBF7] p-2"
                    >
                      <label className="text-xs">
                        Min posts
                        <input
                          type="number"
                          min={0}
                          className="mt-0.5 w-20 rounded border border-[#C8D5B9] px-1 py-0.5"
                          value={t.minPosts}
                          onChange={(e) => setTier(i, { minPosts: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-xs">
                        Max posts
                        <input
                          type="number"
                          min={0}
                          className="mt-0.5 w-20 rounded border border-[#C8D5B9] px-1 py-0.5"
                          value={t.maxPosts}
                          onChange={(e) => setTier(i, { maxPosts: Number(e.target.value) })}
                        />
                      </label>
                      <label className="text-xs">
                        Ad pages
                        <input
                          type="number"
                          min={0}
                          className="mt-0.5 w-20 rounded border border-[#C8D5B9] px-1 py-0.5"
                          value={t.adPages}
                          onChange={(e) => setTier(i, { adPages: Number(e.target.value) })}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeTier(i)}
                        className="ml-auto text-xs text-red-700 hover:underline"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-[#2E2A24]">Preview</h3>
              <table className="mt-2 w-full max-w-md text-sm">
                <thead>
                  <tr className="border-b border-[#C8D5B9] text-left text-xs text-[#5C564D]">
                    <th className="py-1 pr-4 font-medium">Postcards in envelope</th>
                    <th className="py-1 font-medium">Ad pages</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r) => (
                    <tr key={r.posts} className="border-b border-[#C8D5B9]/40">
                      <td className="py-1 pr-4 text-[#2E2A24]">{r.posts}</td>
                      <td className="py-1 text-[#2E2A24]">{r.ads}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {saveError ? <p className="text-sm text-red-700">{saveError}</p> : null}

            <div className="flex items-center gap-3 border-t border-[#C8D5B9]/40 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-[#4F6E43] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save policy"}
              </button>
              <p className="text-xs text-[#5C564D]">Stored in Firestore: <code className="font-mono">adminSettings/envelopeAdPolicy</code></p>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
