"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, apiJson } from "@/lib/api-fetch";
import { SNAIL_ART_CATEGORIES } from "@/lib/snail-art-types";
import { snailArtRequirementSummary } from "@/lib/snail-art-upload-spec";
import { validateSnailArtFileForUpload } from "@/lib/validate-snail-art-file-client";

export default function SnailArtAssetEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(String(params.id ?? ""));
  const [doc, setDoc] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [delBusy, setDelBusy] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [stackOrder, setStackOrder] = useState("");
  const [recolorable, setRecolorable] = useState(true);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<Record<string, unknown>>(`/api/snail-art-assets/${encodeURIComponent(id)}`);
        if (cancelled) return;
        setDoc(data);
        setDisplayName(String(data.displayName ?? ""));
        setDescription(String(data.description ?? ""));
        setStackOrder(String(data.stackOrder ?? ""));
        setRecolorable(data.recolorable !== false);
        setStatus(data.status === "draft" ? "draft" : "published");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function saveMeta() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        displayName: displayName.trim(),
        description: description.trim(),
        recolorable,
        status,
      };
      const so = Number(stackOrder);
      if (stackOrder.trim() && Number.isFinite(so)) body.stackOrder = so;
      const res = await apiFetch(`/api/snail-art-assets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const next = (await res.json()) as Record<string, unknown>;
      setDoc(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function replaceAsset() {
    if (!replaceFile) {
      setError("Choose a file.");
      return;
    }
    const pre = await validateSnailArtFileForUpload(replaceFile);
    if (!pre.ok) {
      setError(pre.error);
      return;
    }
    setReplaceBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", replaceFile);
      fd.set("assetId", id);
      fd.set("category", String(doc?.category ?? "shell"));
      fd.set("displayName", displayName.trim());
      const res = await fetch("/api/snail-art-assets/upload", { method: "POST", body: fd });
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
      const next = JSON.parse(text) as Record<string, unknown>;
      setDoc(next);
      setReplaceFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Replace failed");
    } finally {
      setReplaceBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this asset and its Storage file?")) return;
    setDelBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/snail-art-assets/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.push("/snails");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDelBusy(false);
    }
  }

  const storageUrl = doc?.storageUrl as string | undefined;
  const category = doc?.category as string | undefined;

  return (
    <div className="space-y-6">
      <p>
        <Link href="/snails" className="text-sm text-[#4F6E43] hover:underline">
          ← Snail art catalog
        </Link>
      </p>
      <h1 className="text-2xl font-semibold text-[#2E2A24]">
        {displayName || "Asset"} <span className="font-mono text-base font-normal text-[#5C564D]">{id}</span>
      </h1>
      {category ? (
        <p className="text-sm text-[#5C564D]">
          Slot: <code className="rounded bg-[#E4ECD9] px-1">{category}</code> · slug{" "}
          <code className="rounded bg-[#E4ECD9] px-1">{String(doc?.slug ?? "")}</code>
        </p>
      ) : null}
      {error ? <p className="text-red-700">{error}</p> : null}
      {!doc && !error ? <p className="text-[#5C564D]">Loading…</p> : null}

      {doc ? (
        <>
          {storageUrl ? (
            <div className="rounded-xl border border-[#C8D5B9]/60 bg-white p-6">
              <p className="text-sm font-medium text-[#2E2A24]">Preview</p>
              <div className="mt-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={storageUrl} alt="" className="max-h-56 max-w-full object-contain" />
              </div>
              <a
                href={storageUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-[#4F6E43] hover:underline"
              >
                Open file URL
              </a>
            </div>
          ) : null}

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Metadata</h2>
            <div className="mt-4 grid max-w-lg gap-3">
              <label className="text-sm">
                Display name
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Notes
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2"
                />
              </label>
              <label className="text-sm">
                Stack order (lower = behind). Defaults:{" "}
                {SNAIL_ART_CATEGORIES.map((c) => (
                  <span key={c} className="mr-1">
                    <code className="text-xs">{c}</code>
                  </span>
                ))}
                <input
                  value={stackOrder}
                  onChange={(e) => setStackOrder(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 font-mono"
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={recolorable} onChange={(e) => setRecolorable(e.target.checked)} />
                Recolorable
              </label>
              <label className="text-sm">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "draft" | "published")}
                  className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2"
                >
                  <option value="published">published</option>
                  <option value="draft">draft</option>
                </select>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveMeta()}
                className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save metadata"}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
            <h2 className="font-medium text-[#2E2A24]">Replace file</h2>
            <p className="mt-1 text-xs text-[#5C564D]">
              Extension must match the existing asset (<code className="rounded bg-[#E4ECD9] px-0.5">.svg</code> or{" "}
              <code className="rounded bg-[#E4ECD9] px-0.5">.png</code>). {snailArtRequirementSummary()}
            </p>
            <input
              type="file"
              accept=".svg,.png,image/svg+xml,image/png"
              className="mt-3 block text-sm"
              onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={replaceBusy}
              onClick={() => void replaceAsset()}
              className="mt-3 rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm hover:bg-[#F0F5EA] disabled:opacity-60"
            >
              {replaceBusy ? "Uploading…" : "Replace file"}
            </button>
          </section>

          <section className="rounded-xl border border-red-200 bg-red-50/50 p-5">
            <h2 className="font-medium text-red-900">Danger</h2>
            <button
              type="button"
              disabled={delBusy}
              onClick={() => void remove()}
              className="mt-2 rounded-lg bg-red-800 px-4 py-2 text-sm text-white hover:bg-red-900 disabled:opacity-60"
            >
              {delBusy ? "Deleting…" : "Delete asset"}
            </button>
          </section>

          <pre className="max-h-64 overflow-auto rounded-lg bg-[#2E2A24]/[0.04] p-3 text-xs">{JSON.stringify(doc, null, 2)}</pre>
        </>
      ) : null}
    </div>
  );
}
