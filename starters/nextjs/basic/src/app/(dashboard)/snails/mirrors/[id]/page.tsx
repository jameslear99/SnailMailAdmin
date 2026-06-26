"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, apiJson } from "@/lib/api-fetch";

export default function SnailMirrorDetailPage() {
  const params = useParams();
  const id = decodeURIComponent(String(params.id ?? ""));
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState("");
  const [xp, setXp] = useState("");
  const [appearanceJson, setAppearanceJson] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Record<string, unknown>>(`/api/snails/${encodeURIComponent(id)}`);
        if (cancelled) return;
        setDoc(data);
        if (typeof data.level === "number") setLevel(String(data.level));
        if (typeof data.xp === "number") setXp(String(data.xp));
        if (data.appearance && typeof data.appearance === "object") {
          setAppearanceJson(JSON.stringify(data.appearance, null, 2));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (level.trim()) {
        const n = Number(level);
        if (!Number.isFinite(n)) throw new Error("Level must be a number");
        body.level = n;
      }
      if (xp.trim()) {
        const n = Number(xp);
        if (!Number.isFinite(n)) throw new Error("XP must be a number");
        body.xp = n;
      }
      if (appearanceJson.trim()) {
        body.appearance = JSON.parse(appearanceJson) as Record<string, unknown>;
      }
      const res = await apiFetch(`/api/snails/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t);
      }
      const next = (await res.json()) as Record<string, unknown>;
      setDoc(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const ownerUid = doc?.ownerUid as string | undefined;

  return (
    <div className="space-y-6">
      <p>
        <Link href="/snails/mirrors" className="text-sm text-[#4F6E43] hover:underline">
          ← User snail mirrors
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-[#2E2A24]">Snail {id}</h1>
      {ownerUid ? (
        <p className="text-sm text-[#5C564D]">
          Owner:{" "}
          <Link href={`/users/${encodeURIComponent(ownerUid)}`} className="text-[#4F6E43] hover:underline">
            {ownerUid}
          </Link>
        </p>
      ) : null}
      {error ? <p className="text-red-700">{error}</p> : null}

      {!doc ? <p className="text-[#5C564D]">Loading…</p> : null}

      {doc ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5 lg:col-span-2">
            <h2 className="font-medium text-[#2E2A24]">Edit progression &amp; appearance</h2>
            <p className="mt-1 text-xs text-[#5C564D]">
              Patches <code className="rounded bg-[#E4ECD9] px-1">snail</code> on the owner&apos;s{" "}
              <code className="rounded bg-[#E4ECD9] px-1">users/&#123;uid&#125;</code> doc and mirrors to{" "}
              <code className="rounded bg-[#E4ECD9] px-1">publicProfiles/&#123;uid&#125;</code> when the embedded{" "}
              <code className="rounded bg-[#E4ECD9] px-1">snail.id</code> matches this page&apos;s id.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Level
                <input
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#4F6E43]"
                />
              </label>
              <label className="text-sm">
                XP
                <input
                  value={xp}
                  onChange={(e) => setXp(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#4F6E43]"
                />
              </label>
            </div>
            <label className="mt-4 block text-sm">
              Appearance JSON
              <textarea
                value={appearanceJson}
                onChange={(e) => setAppearanceJson(e.target.value)}
                rows={12}
                className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 font-mono text-xs outline-none focus:border-[#4F6E43]"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="mt-4 rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5 lg:col-span-2">
            <h2 className="font-medium text-[#2E2A24]">Raw document</h2>
            <pre className="mt-3 max-h-[400px] overflow-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs font-mono text-[#2E2A24]">
              {JSON.stringify(doc, null, 2)}
            </pre>
          </section>
        </div>
      ) : null}
    </div>
  );
}
