"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, apiJson } from "@/lib/api-fetch";
import { displayNameFromFilenameStem, normalizeSnailArtSlug, suggestedSlugFromStem } from "@/lib/snail-art-slug";
import {
  compareSnailArtPaintOrder,
  DEFAULT_STACK_ORDER,
  SNAIL_ART_CATEGORIES,
  SNAIL_ART_PAINT_ORDER_TOP_TO_BOTTOM,
  type SnailArtCategory,
} from "@/lib/snail-art-types";
import {
  downloadBlob,
  renderSnailPreview,
  renderSnailPreviewPng,
  snailPreviewDownloadFilename,
} from "@/lib/render-snail-preview-png";
import {
  DEFAULT_PREVIEW_COLORS,
  layerAcceptsPreviewTint,
  previewColorLabel,
  randomPreviewSlotColors,
  tintsForLayersFromColors,
  type PreviewSlotColors,
} from "@/lib/snail-preview-tint";
import {
  DEFAULT_SNAIL_ART_RECOLOR_POLICY,
  type SnailArtRecolorPolicy,
} from "@/lib/snail-art-recolor-policy";
import { snailArtRequirementSummary } from "@/lib/snail-art-upload-spec";
import { validateSnailArtFileForUpload } from "@/lib/validate-snail-art-file-client";

type AssetRow = {
  id: string;
  category?: string;
  slug?: string;
  displayName?: string;
  storageUrl?: string;
  stackOrder?: number;
  fileFormat?: string;
  recolorable?: boolean;
  status?: string;
};

type UploadStep = "pick" | "details";

type PendingUploadRow = {
  clientId: string;
  file: File;
  category: SnailArtCategory;
  displayName: string;
  slug: string;
};

function fileStem(name: string): string {
  const i = name.lastIndexOf(".");
  return (i >= 0 ? name.slice(0, i) : name).trim() || name;
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)]!;
}

const PREVIEW_CANVAS_PX = 200;

function groupByCategory(assetList: AssetRow[]): Map<SnailArtCategory, AssetRow[]> {
  const m = new Map<SnailArtCategory, AssetRow[]>();
  for (const c of SNAIL_ART_CATEGORIES) m.set(c, []);
  for (const a of assetList) {
    const cat = a.category as SnailArtCategory | undefined;
    if (cat && SNAIL_ART_CATEGORIES.includes(cat)) {
      m.get(cat)!.push(a);
    }
  }
  for (const c of SNAIL_ART_CATEGORIES) {
    m.get(c)!.sort(compareSnailArtPaintOrder);
  }
  return m;
}

/** Random preview: ~30% of snails have no accessory layer. */
const RANDOM_SNAIL_NO_ACCESSORY_CHANCE = 0.3;

function randomLayersFromAssets(assetList: AssetRow[]): AssetRow[] {
  const grouped = groupByCategory(assetList);
  const picked: AssetRow[] = [];
  const includeAccessory = Math.random() >= RANDOM_SNAIL_NO_ACCESSORY_CHANCE;
  for (const cat of SNAIL_ART_CATEGORIES) {
    if (cat === "accessory" && !includeAccessory) continue;
    const one = pickRandom(grouped.get(cat) ?? []);
    if (one) picked.push(one);
  }
  picked.sort(compareSnailArtPaintOrder);
  return picked;
}

const ACCEPT_ATTR = ".svg,.png,image/svg+xml,image/png";

function isAllowedSnailFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".svg") || n.endsWith(".png");
}

function categoryLabel(c: SnailArtCategory): string {
  return c === "accessory" ? "Accessories" : c.charAt(0).toUpperCase() + c.slice(1);
}

export default function SnailArtCatalogPage() {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("pick");
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [pendingRows, setPendingRows] = useState<PendingUploadRow[]>([]);
  const [defaultSlot, setDefaultSlot] = useState<SnailArtCategory>("shell");
  const [applyAllCategory, setApplyAllCategory] = useState<SnailArtCategory | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const [previewLayers, setPreviewLayers] = useState<AssetRow[]>([]);
  const [previewColors, setPreviewColors] = useState<PreviewSlotColors>(DEFAULT_PREVIEW_COLORS);
  const [recolorPolicy, setRecolorPolicy] = useState<SnailArtRecolorPolicy>(DEFAULT_SNAIL_ART_RECOLOR_POLICY);
  const [recolorPolicyBusy, setRecolorPolicyBusy] = useState(false);
  const [recolorPolicyError, setRecolorPolicyError] = useState<string | null>(null);
  const [previewRendering, setPreviewRendering] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const previewTints = useMemo(
    () => tintsForLayersFromColors(previewLayers, previewColors, recolorPolicy),
    [previewLayers, previewColors, recolorPolicy],
  );

  const loadRecolorPolicy = useCallback(async (): Promise<SnailArtRecolorPolicy> => {
    try {
      const data = await apiJson<{ policy: SnailArtRecolorPolicy }>("/api/snail-art/recolor-policy");
      setRecolorPolicy(data.policy);
      setRecolorPolicyError(null);
      return data.policy;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load recolor policy";
      setRecolorPolicyError(message);
      return DEFAULT_SNAIL_ART_RECOLOR_POLICY;
    }
  }, []);

  async function saveRecolorPolicy(next: SnailArtRecolorPolicy) {
    setRecolorPolicyBusy(true);
    setRecolorPolicyError(null);
    try {
      const data = await apiJson<{ policy: SnailArtRecolorPolicy }>("/api/snail-art/recolor-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: next }),
      });
      setRecolorPolicy(data.policy);
    } catch (e) {
      setRecolorPolicyError(e instanceof Error ? e.message : "Failed to save recolor policy");
    } finally {
      setRecolorPolicyBusy(false);
    }
  }

  function toggleRecolorCategory(category: SnailArtCategory, enabled: boolean) {
    if (category === "face") return;
    const next = { ...recolorPolicy, [category]: enabled };
    void saveRecolorPolicy(next);
  }

  const load = useCallback(async (): Promise<AssetRow[]> => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiJson<{ assets: AssetRow[] }>("/api/snail-art-assets");
      setAssets(data.assets);
      return data.assets;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load assets");
      return [];
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        await loadRecolorPolicy();
        const list = await load();
        if (cancelled || list.length === 0) return;
        const picked = randomLayersFromAssets(list);
        setPreviewLayers(picked);
        setPreviewColors(randomPreviewSlotColors());
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [load, loadRecolorPolicy]);

  useEffect(() => {
    if (previewLayers.length === 0) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setPreviewRendering(true);
    void renderSnailPreview(canvas, previewLayers, previewTints, PREVIEW_CANVAS_PX)
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to render preview");
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewLayers, previewTints]);

  const byCategory = useMemo(() => groupByCategory(assets), [assets]);

  function regenerateRandomSnail() {
    const picked = randomLayersFromAssets(assets);
    setPreviewLayers(picked);
    setPreviewColors(randomPreviewSlotColors());
  }

  function applyRandomPreviewForList(assetList: AssetRow[]) {
    const picked = randomLayersFromAssets(assetList);
    setPreviewLayers(picked);
    setPreviewColors(randomPreviewSlotColors());
  }

  async function downloadPreviewPng() {
    if (previewLayers.length === 0) return;
    setDownloadBusy(true);
    setError(null);
    try {
      const blob = await renderSnailPreviewPng(previewLayers, previewTints);
      downloadBlob(blob, snailPreviewDownloadFilename(previewLayers));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download preview");
    } finally {
      setDownloadBusy(false);
    }
  }

  function resetAndOpenUpload() {
    setUploadOpen(true);
    setUploadStep("pick");
    setStagedFiles([]);
    setPendingRows([]);
    setApplyAllCategory("");
    setError(null);
    setUploadWarnings(null);
  }

  function closeUploadModal() {
    if (uploadBusy) return;
    setUploadOpen(false);
    setUploadStep("pick");
    setStagedFiles([]);
    setPendingRows([]);
    setError(null);
    setUploadWarnings(null);
    setDragActive(false);
  }

  function appendStagedFiles(files: File[]) {
    const next = files.filter(isAllowedSnailFile);
    if (next.length < files.length) {
      setError("Some files were skipped — only .svg and .png are allowed.");
    } else if (files.length > 0) {
      setError(null);
    }
    setStagedFiles((prev) => [...prev, ...next]);
  }

  function onInputFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (list?.length) appendStagedFiles(Array.from(list));
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const fromDrop = Array.from(e.dataTransfer.files);
    appendStagedFiles(fromDrop);
  }

  async function continueToDetails() {
    if (stagedFiles.length === 0) {
      setError("Add at least one file.");
      return;
    }
    setError(null);
    setUploadWarnings(null);
    const validationErrors: string[] = [];
    const validationWarnings: string[] = [];
    for (const f of stagedFiles) {
      const pre = await validateSnailArtFileForUpload(f);
      if (!pre.ok) {
        validationErrors.push(`${f.name}: ${pre.error}`);
        continue;
      }
      for (const w of pre.warnings) {
        validationWarnings.push(`${f.name}: ${w}`);
      }
    }
    if (validationErrors.length > 0) {
      setError(validationErrors.join("\n"));
      return;
    }
    if (validationWarnings.length > 0) {
      setUploadWarnings(validationWarnings.join("\n"));
    }
    const rows: PendingUploadRow[] = stagedFiles.map((file, index) => {
      const stem = fileStem(file.name);
      return {
        clientId: `${file.name}-${file.size}-${index}-${Math.random().toString(36).slice(2)}`,
        file,
        category: defaultSlot,
        displayName: displayNameFromFilenameStem(stem, index),
        slug: suggestedSlugFromStem(stem, index),
      };
    });
    setPendingRows(rows);
    setUploadStep("details");
  }

  function goBackToPick() {
    setUploadStep("pick");
    setPendingRows([]);
    setApplyAllCategory("");
    setError(null);
  }

  function updateRow(clientId: string, patch: Partial<Pick<PendingUploadRow, "category" | "displayName" | "slug">>) {
    setPendingRows((rows) => rows.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
  }

  function removePendingRow(clientId: string) {
    setPendingRows((rows) => rows.filter((r) => r.clientId !== clientId));
  }

  function applyCategoryToAll(cat: SnailArtCategory) {
    setPendingRows((rows) => rows.map((r) => ({ ...r, category: cat })));
    setApplyAllCategory("");
  }

  async function uploadOneAsset(file: File, category: SnailArtCategory, displayName: string, slugRaw: string) {
    let slug: string;
    try {
      slug = normalizeSnailArtSlug(slugRaw || displayName);
    } catch {
      throw new Error(`${file.name}: Invalid slug — use letters, numbers, and hyphens.`);
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("category", category);
    fd.set("displayName", displayName.trim());
    fd.set("slug", slug);

    const res = await apiFetch("/api/snail-art-assets/upload", {
      method: "POST",
      body: fd,
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* raw */
      }
      throw new Error(`${file.name}: ${msg}`);
    }
  }

  async function submitDetailsUpload(e: React.FormEvent) {
    e.preventDefault();
    if (pendingRows.length === 0) {
      setError("No files to upload.");
      return;
    }
    for (const r of pendingRows) {
      if (!r.displayName.trim()) {
        setError(`Display name is required (${r.file.name}).`);
        return;
      }
      try {
        normalizeSnailArtSlug(r.slug.trim() || r.displayName);
      } catch {
        setError(`Invalid slug for “${r.displayName}” — use letters, numbers, and hyphens.`);
        return;
      }
    }
    const seen = new Set<string>();
    for (const r of pendingRows) {
      const key = `${r.category}:${normalizeSnailArtSlug(r.slug.trim() || r.displayName)}`;
      if (seen.has(key)) {
        setError(`Duplicate slug in this batch for slot “${r.category}”. Edit slugs so each is unique per slot.`);
        return;
      }
      seen.add(key);
    }

    setUploadBusy(true);
    setError(null);
    const errors: string[] = [];
    let ok = 0;
    try {
      for (const r of pendingRows) {
        try {
          await uploadOneAsset(r.file, r.category, r.displayName, r.slug.trim() || r.displayName);
          ok++;
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
      }
      if (errors.length > 0) {
        setError(`${ok} uploaded, ${errors.length} failed:\n${errors.join("\n")}`);
      }
      if (errors.length === 0) {
        setDefaultSlot(pendingRows[0]?.category ?? defaultSlot);
        setUploadOpen(false);
        setUploadStep("pick");
        setStagedFiles([]);
        setPendingRows([]);
        setApplyAllCategory("");
        setError(null);
        setDragActive(false);
      }
      const latest = await load();
      applyRandomPreviewForList(latest);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#2E2A24]">Snail art</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5C564D]">
            Layered parts for unique snails. Assets live in Firestore{" "}
            <code className="rounded bg-[#E4ECD9] px-1 text-xs">snailArtAssets</code> and Storage{" "}
            <code className="rounded bg-[#E4ECD9] px-1 text-xs">snail-art-assets/…</code>. Prefer{" "}
            <strong>PNG</strong> with a transparent background (recommended for shells and accessories) or{" "}
            <strong>SVG</strong> for vector layers. Every file must be the same square canvas size documented below so
            pieces stack correctly in the app.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={resetAndOpenUpload}
            className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634]"
          >
            Upload
          </button>
          <Link
            href="/snails/mirrors"
            className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm text-[#4F6E43] hover:bg-[#F0F5EA]"
          >
            User snail mirrors →
          </Link>
        </div>
      </div>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
        <h2 className="text-sm font-semibold text-[#2E2A24]">Recolor policy</h2>
        <p className="mt-2 max-w-2xl text-xs text-[#5C564D]">
          Choose which component classes can receive player tint colors when snails are generated in the app.
          This applies together with each asset&apos;s own <strong>Recolorable</strong> flag — both must allow
          tinting. New uploads default their recolorable flag from these toggles. Faces are never tinted.
        </p>
        {recolorPolicyError ? (
          <p className="mt-2 text-xs text-red-700">{recolorPolicyError}</p>
        ) : null}
        <ul className="mt-4 flex flex-wrap gap-3">
          {SNAIL_ART_CATEGORIES.map((category) => {
            const label = categoryLabel(category);
            const lockedOff = category === "face";
            const checked = lockedOff ? false : recolorPolicy[category];
            return (
              <li key={category}>
                <label
                  className={`flex items-center gap-2 rounded-lg border border-[#C8D5B9]/80 bg-white px-3 py-2 text-sm ${
                    lockedOff ? "opacity-60" : "cursor-pointer hover:bg-[#F0F5EA]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={recolorPolicyBusy || lockedOff}
                    onChange={(e) => toggleRecolorCategory(category, e.target.checked)}
                    className="rounded border-[#C8D5B9]"
                  />
                  <span className="text-[#2E2A24]">{label}</span>
                  {lockedOff ? (
                    <span className="text-[10px] text-[#5C564D]">always off</span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
        {recolorPolicyBusy ? (
          <p className="mt-2 text-xs text-[#5C564D]">Saving recolor policy…</p>
        ) : null}
      </section>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
        <h2 className="text-sm font-semibold text-[#2E2A24]">Layer slots &amp; stack order</h2>
        <p className="mt-2 text-xs text-[#5C564D]">
          Paint order top → bottom:{" "}
          {SNAIL_ART_PAINT_ORDER_TOP_TO_BOTTOM.map((c) => categoryLabel(c)).join(" · ")}. Lower{" "}
          <code className="rounded bg-[#E4ECD9] px-0.5">stackOrder</code> = further back (
          {SNAIL_ART_CATEGORIES.map((c) => (
            <span key={c} className="mr-2 inline-block">
              <code className="rounded bg-[#E4ECD9] px-1">{c}</code>={DEFAULT_STACK_ORDER[c]}
            </span>
          ))}
          ).
        </p>
      </section>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-medium text-[#2E2A24]">Random snail preview</h2>
            <p className="mt-1 max-w-xl text-xs text-[#5C564D]">
              Picks one random asset per required slot (when that slot has items), skips accessories about 30% of the
              time, and stacks in catalog paint order. Body, shell, and antenna use the same{" "}
              <strong>modulate</strong> tint as the Flutter app; faces and accessories keep their source colors. For
              natural recoloring, publish those slots as neutral/grayscale art — pre-colored PNGs (e.g. a purple body)
              cannot shift cleanly to browns or reds. Use the color pickers below to test palette choices, or{" "}
              <strong>Download PNG</strong> at full 1500×1500.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy || assets.length === 0}
              onClick={() => regenerateRandomSnail()}
              className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm font-medium text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-50"
            >
              New random snail
            </button>
            <button
              type="button"
              disabled={busy || downloadBusy || previewLayers.length === 0}
              onClick={() => void downloadPreviewPng()}
              className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm font-medium text-[#4F6E43] hover:bg-[#F0F5EA] disabled:opacity-50"
            >
              {downloadBusy ? "Exporting…" : "Download PNG"}
            </button>
            <button
              type="button"
              disabled={busy || previewRendering || previewLayers.length === 0}
              onClick={() => setPreviewColors(randomPreviewSlotColors())}
              className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm text-[#4F6E43] hover:bg-[#F0F5EA] disabled:opacity-50"
            >
              Random colors
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-col items-start gap-4 lg:flex-row">
          <div className="relative mx-auto h-56 w-56 shrink-0 rounded-2xl border border-[#C8D5B9]/80 bg-[linear-gradient(145deg,#f6f9f2_0%,#e8efe0_100%)] shadow-inner lg:mx-0">
            {previewLayers.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[#5C564D]">
                {busy ? "Loading…" : "Upload assets per slot to preview mixes here."}
              </div>
            ) : (
              <div className="absolute inset-3 flex items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  width={PREVIEW_CANVAS_PX}
                  height={PREVIEW_CANVAS_PX}
                  className="max-h-full max-w-full object-contain"
                  aria-label="Random snail preview"
                />
                {previewRendering ? (
                  <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-[#5C564D]">
                    Rendering…
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <ul className="min-w-0 flex-1 space-y-3 text-xs text-[#5C564D]">
            {previewLayers.length === 0 ? null : (
              <>
                <li>
                  <p className="font-medium text-[#2E2A24]">Tint colors</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {(Object.keys(previewColors) as Array<keyof PreviewSlotColors>)
                      .filter((slot) => recolorPolicy[slot])
                      .map((slot) => (
                      <label key={slot} className="flex items-center gap-2">
                        <span className="w-14 capitalize text-[#2E2A24]">{previewColorLabel(slot)}</span>
                        <input
                          type="color"
                          value={previewColors[slot]}
                          onChange={(e) =>
                            setPreviewColors((prev) => ({
                              ...prev,
                              [slot]: e.target.value,
                            }))
                          }
                          className="h-8 w-10 cursor-pointer rounded border border-[#C8D5B9] bg-white p-0.5"
                        />
                        <code className="rounded bg-[#E4ECD9] px-1 py-0.5 text-[10px]">{previewColors[slot]}</code>
                      </label>
                    ))}
                  </div>
                  {!recolorPolicy.body && !recolorPolicy.shell && !recolorPolicy.antenna ? (
                    <p className="mt-2 text-[10px] text-[#5C564D]">
                      Enable body, shell, or antenna in recolor policy to preview tint colors.
                    </p>
                  ) : null}
                </li>
                <li className="font-medium text-[#2E2A24]">This mix</li>
                {previewLayers.map((layer, index) => {
                  const tint = previewTints[index];
                  const tinted = layerAcceptsPreviewTint(layer, recolorPolicy);
                  return (
                    <li key={layer.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="rounded bg-[#E4ECD9] px-1.5 py-0.5 font-medium uppercase text-[#2E3D28]">
                        {layer.category}
                      </span>
                      <span>{layer.displayName ?? layer.slug}</span>
                      {tinted && tint ? (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-[#C8D5B9]"
                          style={{ backgroundColor: tint }}
                          title={`Tint ${tint}`}
                        />
                      ) : (
                        <span className="text-[10px] text-[#5C564D]">source colors</span>
                      )}
                      <Link href={`/snails/library/${encodeURIComponent(layer.id)}`} className="text-[#4F6E43] hover:underline">
                        edit
                      </Link>
                    </li>
                  );
                })}
              </>
            )}
          </ul>
        </div>
      </section>

      {error && !uploadOpen ? <p className="whitespace-pre-wrap text-sm text-red-700">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-[#2E2A24]">Catalog</span>
        <span className="text-sm text-[#5C564D]">
          {assets.length} asset{assets.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="text-sm text-[#4F6E43] underline disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {busy && assets.length === 0 ? (
        <p className="text-sm text-[#5C564D]">Loading catalog…</p>
      ) : null}

      {!busy && assets.length === 0 ? (
        <p className="text-center text-sm text-[#5C564D]">
          No assets yet. Use <strong>Upload</strong> to add 1500×1500 SVG or PNG layers.
        </p>
      ) : null}

      {SNAIL_ART_CATEGORIES.map((category) => {
        const rows = byCategory.get(category) ?? [];
        const label = category === "accessory" ? "Accessories" : category.charAt(0).toUpperCase() + category.slice(1);
        return (
          <section key={category} className="scroll-mt-4">
            <h2 className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-[#C8D5B9]/50 pb-2 text-lg font-semibold text-[#2E2A24]">
              {label}
              <span className="text-sm font-normal text-[#5C564D]">
                ({rows.length}) · default stack {DEFAULT_STACK_ORDER[category]}
              </span>
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-[#5C564D]">No {label.toLowerCase()} yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((a) => (
                  <article
                    key={a.id}
                    className="flex flex-col overflow-hidden rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7]"
                  >
                    <div className="relative flex h-40 items-center justify-center bg-white/80">
                      {a.storageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.storageUrl} alt="" className="max-h-36 max-w-[90%] object-contain" />
                      ) : (
                        <span className="text-xs text-[#5C564D]">No preview</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.status === "draft" ? (
                          <span className="text-xs text-amber-800">draft</span>
                        ) : null}
                        {a.recolorable === false ? (
                          <span className="text-xs text-[#5C564D]">fixed colors</span>
                        ) : null}
                      </div>
                      <h3 className="font-medium text-[#2E2A24]">{a.displayName ?? "—"}</h3>
                      <p className="font-mono text-xs text-[#5C564D]">
                        {a.slug} · stack {a.stackOrder ?? "—"} · {a.fileFormat}
                      </p>
                      <Link
                        href={`/snails/library/${encodeURIComponent(a.id)}`}
                        className="mt-2 text-sm text-[#4F6E43] hover:underline"
                      >
                        Edit metadata / replace file →
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {uploadOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeUploadModal();
          }}
        >
          <div
            className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[#C8D5B9] bg-[#FDFBF7] p-5 shadow-xl ${
              uploadStep === "details" ? "max-w-3xl" : "max-w-lg"
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-dialog-title"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 id="upload-dialog-title" className="text-lg font-semibold text-[#2E2A24]">
                {uploadStep === "pick" ? "Add files" : "Edit details & upload"}
              </h2>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploadBusy}
                className="rounded-lg px-2 py-1 text-sm text-[#5C564D] hover:bg-[#E4ECD9] disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-[#5C4A28]">
              <strong className="text-[#2E2A24]">Requirements:</strong> {snailArtRequirementSummary()} Whether a piece
              is recolorable in the app depends on the recolor policy above and the per-asset flag.
            </p>

            {error && uploadOpen ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>
            ) : null}
            {uploadWarnings && uploadOpen && !error ? (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
                {uploadWarnings}
              </p>
            ) : null}

            {uploadStep === "pick" ? (
              <div className="mt-4 space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT_ATTR}
                  className="sr-only"
                  onChange={onInputFiles}
                />
                <button
                  type="button"
                  onDragEnter={() => setDragActive(true)}
                  onDragLeave={() => setDragActive(false)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragActive(true);
                  }}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex min-h-[9rem] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
                    dragActive
                      ? "border-[#4F6E43] bg-[#E4ECD9]/50"
                      : "border-[#C8D5B9] bg-white/60 hover:border-[#8FAA7E] hover:bg-[#F0F5EA]/80"
                  }`}
                >
                  <span className="text-sm font-medium text-[#2E2A24]">Drag &amp; drop files here</span>
                  <span className="text-xs text-[#5C564D]">or click to choose — .svg or .png</span>
                </button>

                <label className="block text-sm text-[#5C564D]">
                  Default component class for the next step
                  <select
                    value={defaultSlot}
                    onChange={(e) => setDefaultSlot(e.target.value as SnailArtCategory)}
                    className="mt-1 block w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-[#2E2A24]"
                  >
                    {SNAIL_ART_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {categoryLabel(c)} (stack {DEFAULT_STACK_ORDER[c]})
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs">You can change this per file on the next screen.</span>
                </label>

                {stagedFiles.length > 0 ? (
                  <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[#C8D5B9]/60 bg-white p-2 text-sm">
                    {stagedFiles.map((f, i) => (
                      <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between gap-2 py-1">
                        <span className="truncate font-mono text-xs text-[#2E2A24]">{f.name}</span>
                        <button
                          type="button"
                          className="shrink-0 text-xs text-red-800 hover:underline"
                          onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-center text-xs text-[#5C564D]">No files added yet.</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={uploadBusy || stagedFiles.length === 0}
                    onClick={() => void continueToDetails()}
                    className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={closeUploadModal}
                    className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#5C564D] hover:bg-[#F0F5EA]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <form className="mt-4 space-y-4" onSubmit={(e) => void submitDetailsUpload(e)}>
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={goBackToPick}
                    className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm text-[#5C564D] hover:bg-[#F0F5EA]"
                  >
                    ← Back to files
                  </button>
                  <div className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:max-w-xs">
                    <label className="text-xs font-medium text-[#5C564D]">Set component class for all</label>
                    <div className="flex gap-2">
                      <select
                        value={applyAllCategory}
                        onChange={(e) => setApplyAllCategory(e.target.value as SnailArtCategory | "")}
                        className="min-w-0 flex-1 rounded-lg border border-[#C8D5B9] bg-white px-2 py-2 text-sm text-[#2E2A24]"
                      >
                        <option value="">Select…</option>
                        {SNAIL_ART_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {categoryLabel(c)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!applyAllCategory}
                        onClick={() => applyAllCategory && applyCategoryToAll(applyAllCategory)}
                        className="shrink-0 rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm hover:bg-[#F0F5EA] disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-[#C8D5B9]/60">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#C8D5B9]/60 bg-[#E4ECD9]/40">
                        <th className="p-2 font-medium text-[#2E2A24]">File</th>
                        <th className="p-2 font-medium text-[#2E2A24]">Component</th>
                        <th className="p-2 font-medium text-[#2E2A24]">Display name</th>
                        <th className="p-2 font-medium text-[#2E2A24]">Slug</th>
                        <th className="w-10 p-2" aria-label="Actions" />
                      </tr>
                    </thead>
                    <tbody>
                      {pendingRows.map((r) => (
                        <tr key={r.clientId} className="border-b border-[#C8D5B9]/30 bg-white/80">
                          <td className="max-w-[8rem] p-2 font-mono text-xs text-[#5C564D]" title={r.file.name}>
                            <span className="line-clamp-2">{r.file.name}</span>
                          </td>
                          <td className="p-2">
                            <select
                              value={r.category}
                              onChange={(e) =>
                                updateRow(r.clientId, { category: e.target.value as SnailArtCategory })
                              }
                              className="w-full min-w-[6.5rem] rounded border border-[#C8D5B9] bg-white px-2 py-1.5 text-xs"
                            >
                              {SNAIL_ART_CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {categoryLabel(c)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              value={r.displayName}
                              onChange={(e) => updateRow(r.clientId, { displayName: e.target.value })}
                              className="w-full min-w-[8rem] rounded border border-[#C8D5B9] bg-white px-2 py-1.5 text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              value={r.slug}
                              onChange={(e) => updateRow(r.clientId, { slug: e.target.value })}
                              className="w-full min-w-[6rem] rounded border border-[#C8D5B9] bg-white px-2 py-1.5 font-mono text-xs"
                            />
                          </td>
                          <td className="p-2">
                            <button
                              type="button"
                              className="text-xs text-red-800 hover:underline"
                              onClick={() => removePendingRow(r.clientId)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pendingRows.length === 0 ? (
                  <p className="text-sm text-[#5C564D]">All items removed. Go back to add files.</p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={uploadBusy || pendingRows.length === 0}
                    className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
                  >
                    {uploadBusy ? "Uploading…" : `Upload ${pendingRows.length} asset${pendingRows.length === 1 ? "" : "s"}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
