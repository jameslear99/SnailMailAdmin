"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch, apiJson } from "@/lib/api-fetch";
import {
  EMPTY_CREDENTIALS_DRAFT,
  type LobCredentialsDraft,
  type LobCredentialsPublicView,
} from "@/lib/lob-credentials-types";

function KeyField({
  label,
  hint,
  status,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  status?: LobCredentialsPublicView["test"]["secretKey"];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-[#2E2A24]">{label}</span>
      {status?.configured ? (
        <span className="mt-0.5 block text-xs text-[#5C564D]">
          Current: <code className="text-[11px]">{status.masked}</code>
          {status.source === "env" ? " (from .env.local)" : " (encrypted in Firestore)"}
        </span>
      ) : (
        <span className="mt-0.5 block text-xs text-amber-800/90">Not configured</span>
      )}
      <input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2 font-mono text-sm"
      />
      {hint ? <span className="mt-1 block text-xs text-[#5C564D]">{hint}</span> : null}
    </label>
  );
}

export function LobCredentialsSection() {
  const [view, setView] = useState<LobCredentialsPublicView | null>(null);
  const [draft, setDraft] = useState<LobCredentialsDraft>(EMPTY_CREDENTIALS_DRAFT);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const data = await apiJson<{ credentials: LobCredentialsPublicView }>("/api/printing/lob-credentials");
      setView(data.credentials);
      setDraft(EMPTY_CREDENTIALS_DRAFT);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load credentials");
      setView(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCredentials() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const body: Record<string, string | boolean> = {};
      if (draft.testSecretKey.trim()) body.testSecretKey = draft.testSecretKey.trim();
      if (draft.testPublishableKey.trim()) body.testPublishableKey = draft.testPublishableKey.trim();
      if (draft.liveSecretKey.trim()) body.liveSecretKey = draft.liveSecretKey.trim();
      if (draft.livePublishableKey.trim()) body.livePublishableKey = draft.livePublishableKey.trim();

      if (Object.keys(body).length === 0) {
        throw new Error("Enter at least one new key to save (leave blank to keep existing)");
      }

      const res = await apiFetch("/api/printing/lob-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      const j = JSON.parse(text) as { credentials: LobCredentialsPublicView };
      setView(j.credentials);
      setDraft(EMPTY_CREDENTIALS_DRAFT);
      setSaveOk("API keys saved (encrypted at rest). Input fields cleared.");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearEnvironment(env: "test" | "live") {
    if (!window.confirm(`Remove stored ${env} Lob keys from Firestore? Env fallbacks still work.`)) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(null);
    try {
      const res = await apiFetch("/api/printing/lob-credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(env === "test" ? { clearTest: true } : { clearLive: true }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const j = JSON.parse(text) as { credentials: LobCredentialsPublicView };
      setView(j.credentials);
      setSaveOk(`Cleared ${env} keys from Firestore`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#C8D5B9]/60 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium text-[#2E2A24]">API keys</h2>
      <p className="mt-1 text-sm text-[#5C564D]">
        Secret keys are encrypted in Firestore (<code className="text-xs">adminSecrets/lobApiCredentials</code>)
        and never sent back to the browser in full. Only admins can update them via this server API.
      </p>

      {loadError ? <p className="mt-3 text-sm text-red-700">{loadError}</p> : null}
      {saveError ? <p className="mt-3 text-sm text-red-700">{saveError}</p> : null}
      {saveOk ? <p className="mt-3 text-sm text-[#4F6E43]">{saveOk}</p> : null}

      {busy && !view ? (
        <p className="mt-4 text-sm text-[#5C564D]">Loading credential status…</p>
      ) : view ? (
        <div className="mt-4 space-y-6">
          {!view.storageReady ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Add <code className="text-xs">LOB_CREDENTIALS_ENCRYPTION_KEY</code> to Admin{" "}
              <code className="text-xs">.env.local</code> before saving keys here (use a long random string).
              Until then, keys can only be set via <code className="text-xs">LOB_API_KEY_TEST</code> in env.
            </div>
          ) : null}

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[#2E2A24]">Test mode</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <KeyField
                label="Secret API key"
                status={view.test.secretKey}
                value={draft.testSecretKey}
                onChange={(v) => setDraft((d) => ({ ...d, testSecretKey: v }))}
                placeholder="test_… (leave blank to keep current)"
                hint="Used for server-side Lob letter submission."
              />
              <KeyField
                label="Publishable API key"
                status={view.test.publishableKey}
                value={draft.testPublishableKey}
                onChange={(v) => setDraft((d) => ({ ...d, testPublishableKey: v }))}
                placeholder="test_pub_… (leave blank to keep current)"
                hint="For future client-side Lob features (e.g. address widgets)."
              />
            </div>
            {(view.test.secretKey.source === "firestore" || view.test.publishableKey.source === "firestore") ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void clearEnvironment("test")}
                className="text-xs text-red-800 underline disabled:opacity-50"
              >
                Clear stored test keys
              </button>
            ) : null}
          </div>

          <div className="space-y-4 border-t border-[#C8D5B9]/40 pt-6">
            <h3 className="text-sm font-semibold text-[#2E2A24]">Live mode</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <KeyField
                label="Secret API key"
                status={view.live.secretKey}
                value={draft.liveSecretKey}
                onChange={(v) => setDraft((d) => ({ ...d, liveSecretKey: v }))}
                placeholder="live_… (leave blank to keep current)"
              />
              <KeyField
                label="Publishable API key"
                status={view.live.publishableKey}
                value={draft.livePublishableKey}
                onChange={(v) => setDraft((d) => ({ ...d, livePublishableKey: v }))}
                placeholder="live_pub_… (leave blank to keep current)"
              />
            </div>
            {(view.live.secretKey.source === "firestore" || view.live.publishableKey.source === "firestore") ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void clearEnvironment("live")}
                className="text-xs text-red-800 underline disabled:opacity-50"
              >
                Clear stored live keys
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving || !view.storageReady}
              onClick={() => void saveCredentials()}
              className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3d5634] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save API keys"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm hover:bg-[#F0F5EA] disabled:opacity-50"
            >
              Reload status
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
