"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SnailLayerOptionPicker } from "@/components/users/snail-layer-option-picker";
import { apiFetch, apiJson } from "@/lib/api-fetch";
import {
  hexToFlutterColor,
  parseSnailLookFromSnail,
  type ParsedSnailLook,
} from "@/lib/parse-snail-look";
import { renderSnailPreview } from "@/lib/render-snail-preview-png";
import {
  DEFAULT_SNAIL_ART_RECOLOR_POLICY,
  type SnailArtRecolorPolicy,
} from "@/lib/snail-art-recolor-policy";
import {
  compareSnailArtPaintOrder,
  SNAIL_ART_CATEGORIES,
  type SnailArtCategory,
} from "@/lib/snail-art-types";
import {
  layerAcceptsPreviewTint,
  previewColorLabel,
  tintsForLayersFromColors,
  type PreviewSlotColors,
} from "@/lib/snail-preview-tint";

type AssetRow = {
  id: string;
  category?: string;
  slug?: string;
  displayName?: string;
  recolorable?: boolean;
  stackOrder?: number;
};

type EditState = {
  name: string;
  hometown: string;
  backstory: string;
  antennaAssetId: string;
  bodyAssetId: string;
  shellAssetId: string;
  faceAssetId: string;
  accessoryAssetId: string;
  antennaColor: string;
  bodyColor: string;
  shellColor: string;
};

type UserSnailSectionProps = {
  snail: Record<string, unknown>;
  onSnailUpdated: (snail: Record<string, unknown>) => void;
};

const PREVIEW_CANVAS_PX = 224;
const PREVIEW_DEBOUNCE_MS = 180;

function previewRenderKey(
  layers: AssetRow[],
  tints: (string | null)[],
): string {
  return `${layers.map((l) => l.id).join(",")}|${tints.join(",")}`;
}

function categoryLabel(c: SnailArtCategory): string {
  return c === "accessory" ? "Accessory" : c.charAt(0).toUpperCase() + c.slice(1);
}

function assetLabel(asset: AssetRow | undefined, fallbackId: string): string {
  if (!asset) return fallbackId.slice(0, 12) + "…";
  return asset.displayName?.trim() || asset.slug?.trim() || asset.id.slice(0, 12) + "…";
}

function groupAssetsByCategory(assetList: AssetRow[]): Map<SnailArtCategory, AssetRow[]> {
  const map = new Map<SnailArtCategory, AssetRow[]>();
  for (const cat of SNAIL_ART_CATEGORIES) map.set(cat, []);
  for (const asset of assetList) {
    const cat = asset.category as SnailArtCategory | undefined;
    if (cat && SNAIL_ART_CATEGORIES.includes(cat)) {
      map.get(cat)!.push(asset);
    }
  }
  for (const cat of SNAIL_ART_CATEGORIES) {
    map.get(cat)!.sort(compareSnailArtPaintOrder);
  }
  return map;
}

function lookToEditState(snail: Record<string, unknown>): EditState {
  const look = parseSnailLookFromSnail(snail);
  return {
    name: String(snail.name ?? ""),
    hometown: String(snail.hometown ?? ""),
    backstory: String(snail.backstory ?? ""),
    antennaAssetId: look?.antennaAssetId ?? "",
    bodyAssetId: look?.bodyAssetId ?? "",
    shellAssetId: look?.shellAssetId ?? "",
    faceAssetId: look?.faceAssetId ?? "",
    accessoryAssetId: look?.accessoryAssetId ?? "",
    antennaColor: look?.antennaColor ?? "#6e8b5e",
    bodyColor: look?.bodyColor ?? "#6e8b5e",
    shellColor: look?.shellColor ?? "#8b9e7a",
  };
}

function editStateToLook(edit: EditState): ParsedSnailLook {
  return {
    antennaAssetId: edit.antennaAssetId.trim(),
    bodyAssetId: edit.bodyAssetId.trim(),
    shellAssetId: edit.shellAssetId.trim(),
    faceAssetId: edit.faceAssetId.trim(),
    accessoryAssetId: edit.accessoryAssetId.trim() || undefined,
    antennaColor: edit.antennaColor,
    bodyColor: edit.bodyColor,
    shellColor: edit.shellColor,
  };
}

function resolvePreviewLayers(look: ParsedSnailLook, assets: AssetRow[]): AssetRow[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ids = [
    look.antennaAssetId,
    look.bodyAssetId,
    look.shellAssetId,
    look.faceAssetId,
    ...(look.accessoryAssetId ? [look.accessoryAssetId] : []),
  ];
  return ids
    .map((id) => byId.get(id))
    .filter((layer): layer is AssetRow => Boolean(layer))
    .sort(compareSnailArtPaintOrder);
}

function TraitRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-28 shrink-0 text-[#5C564D]">{label}</dt>
      <dd className="min-w-0 text-[#2E2A24]">{value}</dd>
    </div>
  );
}

export function UserSnailSection({ snail, onSnailUpdated }: UserSnailSectionProps) {
  const snailId = String(snail.id ?? "");
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [recolorPolicy, setRecolorPolicy] = useState<SnailArtRecolorPolicy>(DEFAULT_SNAIL_ART_RECOLOR_POLICY);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState>(() => lookToEditState(snail));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderRequestRef = useRef(0);

  const look = useMemo(() => parseSnailLookFromSnail(snail), [snail]);
  const displayLook = editing ? editStateToLook(edit) : look;
  const previewLayers = useMemo(
    () => (displayLook ? resolvePreviewLayers(displayLook, assets) : []),
    [displayLook, assets],
  );
  const previewColors: PreviewSlotColors = useMemo(
    () =>
      displayLook
        ? {
            body: displayLook.bodyColor,
            shell: displayLook.shellColor,
            antenna: displayLook.antennaColor,
          }
        : { body: "#6e8b5e", shell: "#8b9e7a", antenna: "#6e8b5e" },
    [displayLook],
  );
  const previewTints = useMemo(
    () => tintsForLayersFromColors(previewLayers, previewColors, recolorPolicy),
    [previewLayers, previewColors, recolorPolicy],
  );
  const assetsByCategory = useMemo(() => groupAssetsByCategory(assets), [assets]);
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);

  const loadCatalog = useCallback(async () => {
    try {
      const [assetData, policyData] = await Promise.all([
        apiJson<{ assets: AssetRow[] }>("/api/snail-art-assets"),
        apiJson<{ policy: SnailArtRecolorPolicy }>("/api/snail-art/recolor-policy"),
      ]);
      setAssets(assetData.assets);
      setRecolorPolicy(policyData.policy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load snail art catalog");
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!editing) {
      setEdit(lookToEditState(snail));
    }
  }, [snail, editing]);

  const previewRenderKeyValue = useMemo(
    () => (previewLayers.length > 0 ? previewRenderKey(previewLayers, previewTints) : ""),
    [previewLayers, previewTints],
  );

  useEffect(() => {
    if (!previewRenderKeyValue || previewLayers.length === 0) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const layers = previewLayers;
    const tints = previewTints;
    const requestId = ++renderRequestRef.current;

    const timer = window.setTimeout(() => {
      void renderSnailPreview(canvas, layers, tints, PREVIEW_CANVAS_PX).catch((e) => {
        if (requestId === renderRequestRef.current) {
          setError(e instanceof Error ? e.message : "Failed to render snail preview");
        }
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [previewRenderKeyValue, previewLayers, previewTints]);

  function startEditing() {
    setEdit(lookToEditState(snail));
    setEditing(true);
    setError(null);
    setMessage(null);
  }

  function cancelEditing() {
    setEdit(lookToEditState(snail));
    setEditing(false);
    setError(null);
  }

  function updateEdit(patch: Partial<EditState>) {
    setEdit((prev) => ({ ...prev, ...patch }));
  }

  async function save() {
    if (!snailId) {
      setError("Snail id is missing — cannot save.");
      return;
    }
    const required = [
      ["antennaAssetId", edit.antennaAssetId],
      ["bodyAssetId", edit.bodyAssetId],
      ["shellAssetId", edit.shellAssetId],
      ["faceAssetId", edit.faceAssetId],
    ] as const;
    for (const [field, value] of required) {
      if (!value.trim()) {
        setError(`${field} is required.`);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const lookPayload: Record<string, unknown> = {
        antennaAssetId: edit.antennaAssetId.trim(),
        bodyAssetId: edit.bodyAssetId.trim(),
        shellAssetId: edit.shellAssetId.trim(),
        faceAssetId: edit.faceAssetId.trim(),
        antennaColor: hexToFlutterColor(edit.antennaColor),
        bodyColor: hexToFlutterColor(edit.bodyColor),
        shellColor: hexToFlutterColor(edit.shellColor),
      };
      const accessory = edit.accessoryAssetId.trim();
      if (accessory) {
        lookPayload.accessoryAssetId = accessory;
      } else {
        lookPayload.accessoryAssetId = null;
      }

      const res = await apiFetch(`/api/snails/${encodeURIComponent(snailId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name.trim(),
          hometown: edit.hometown.trim(),
          backstory: edit.backstory.trim(),
          look: lookPayload,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const updated = (await res.json()) as Record<string, unknown>;
      onSnailUpdated(updated);
      setEditing(false);
      setMessage("Snail updated. Changes sync to the app and public profile.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
      <h2 className="font-medium text-[#2E2A24]">Snail</h2>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-[#4F6E43]">{message}</p> : null}

      <div className="mt-4 flex flex-col items-start gap-6 lg:flex-row">
        <div className="flex shrink-0 flex-col items-start gap-3">
          <div className="relative h-56 w-56 rounded-2xl border border-[#C8D5B9]/80 bg-[linear-gradient(145deg,#f6f9f2_0%,#e8efe0_100%)] shadow-inner">
            {previewLayers.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-xs text-[#5C564D]">
                {look ? "Loading snail art…" : "No visual look assigned yet."}
              </div>
            ) : (
              <div className="absolute inset-3 flex items-center justify-center">
                <canvas
                  ref={previewCanvasRef}
                  width={PREVIEW_CANVAS_PX}
                  height={PREVIEW_CANVAS_PX}
                  className="max-h-full max-w-full object-contain"
                  aria-label="User snail preview"
                />
              </div>
            )}
          </div>

          {editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={cancelEditing}
                className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-1.5 text-sm text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-[#4F6E43] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-1.5 text-sm text-[#4F6E43] hover:bg-[#F0F5EA]"
            >
              Edit snail
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          {editing ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-[#2E2A24]">Name</span>
                  <input
                    value={edit.name}
                    onChange={(e) => updateEdit({ name: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-[#2E2A24] outline-none focus:border-[#4F6E43]"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-[#2E2A24]">Hometown</span>
                  <input
                    value={edit.hometown}
                    onChange={(e) => updateEdit({ hometown: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-[#2E2A24] outline-none focus:border-[#4F6E43]"
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-[#2E2A24]">Backstory</span>
                  <textarea
                    value={edit.backstory}
                    onChange={(e) => updateEdit({ backstory: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-[#2E2A24] outline-none focus:border-[#4F6E43]"
                  />
                </label>
              </div>

              <div>
                <p className="text-sm font-medium text-[#2E2A24]">Appearance</p>
                <p className="mt-1 text-xs text-[#5C564D]">
                  Each tile shows how the full snail looks with that part selected.
                </p>
                <div className="mt-3 space-y-4">
                  {SNAIL_ART_CATEGORIES.map((category) => {
                    const fieldKey = `${category}AssetId` as keyof EditState;
                    const options = assetsByCategory.get(category) ?? [];
                    const selectedAssetId = String(edit[fieldKey] ?? "");
                    const baseLook = editStateToLook(edit);
                    return (
                      <div key={category}>
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#5C564D]">
                          {categoryLabel(category)}
                        </p>
                        {options.length === 0 && category !== "accessory" ? (
                          <p className="text-xs text-[#5C564D]">No assets in catalog.</p>
                        ) : (
                          <SnailLayerOptionPicker
                            category={category}
                            options={options}
                            selectedAssetId={selectedAssetId}
                            baseLook={baseLook}
                            assets={assets}
                            recolorPolicy={recolorPolicy}
                            onSelect={(assetId) =>
                              updateEdit({ [fieldKey]: assetId } as Partial<EditState>)
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-[#2E2A24]">Tint colors</p>
                <div className="mt-2 flex flex-wrap gap-4">
                  {(Object.keys(previewColors) as Array<keyof PreviewSlotColors>)
                    .filter((slot) => recolorPolicy[slot])
                    .map((slot) => (
                      <label key={slot} className="flex items-center gap-2 text-sm">
                        <span className="w-14 text-[#5C564D]">{previewColorLabel(slot)}</span>
                        <input
                          type="color"
                          value={edit[`${slot}Color` as keyof EditState] as string}
                          onChange={(e) =>
                            updateEdit({ [`${slot}Color`]: e.target.value } as Partial<EditState>)
                          }
                          className="h-8 w-10 cursor-pointer rounded border border-[#C8D5B9] bg-white p-0.5"
                        />
                        <code className="rounded bg-[#E4ECD9] px-1 py-0.5 text-[10px]">
                          {edit[`${slot}Color` as keyof EditState] as string}
                        </code>
                      </label>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              <TraitRow label="Name" value={String(snail.name ?? "—")} />
              <TraitRow label="Hometown" value={String(snail.hometown ?? "—")} />
              <TraitRow
                label="Backstory"
                value={
                  snail.backstory ? (
                    <span className="whitespace-pre-wrap">{String(snail.backstory)}</span>
                  ) : (
                    "—"
                  )
                }
              />
              <TraitRow
                label="Snail id"
                value={<code className="rounded bg-[#E4ECD9] px-1 text-xs">{snailId || "—"}</code>}
              />
              {look ? (
                <>
                  <TraitRow
                    label="Layers"
                    value={
                      <ul className="space-y-1">
                        {(
                          [
                            ["Antenna", look.antennaAssetId],
                            ["Body", look.bodyAssetId],
                            ["Shell", look.shellAssetId],
                            ["Face", look.faceAssetId],
                            ...(look.accessoryAssetId
                              ? [["Accessory", look.accessoryAssetId] as const]
                              : []),
                          ] as const
                        ).map(([label, assetId]) => {
                          const asset = assetById.get(assetId);
                          return (
                            <li key={label} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="rounded bg-[#E4ECD9] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[#2E3D28]">
                                {label}
                              </span>
                              <span>{assetLabel(asset, assetId)}</span>
                              {asset ? (
                                <Link
                                  href={`/snails/library/${encodeURIComponent(asset.id)}`}
                                  className="text-xs text-[#4F6E43] hover:underline"
                                >
                                  catalog
                                </Link>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    }
                  />
                  <TraitRow
                    label="Colors"
                    value={
                      <div className="flex flex-wrap gap-3">
                        {(
                          [
                            ["Body", look.bodyColor],
                            ["Shell", look.shellColor],
                            ["Antenna", look.antennaColor],
                          ] as const
                        ).map(([label, color]) => (
                          <span key={label} className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block h-4 w-4 rounded-full border border-[#C8D5B9]"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-xs text-[#5C564D]">
                              {label}{" "}
                              <code className="rounded bg-[#E4ECD9] px-1">{color}</code>
                            </span>
                          </span>
                        ))}
                      </div>
                    }
                  />
                </>
              ) : (
                <TraitRow
                  label="Look"
                  value={
                    <span className="text-[#5C564D]">
                      No structured <code className="rounded bg-[#E4ECD9] px-1">look</code> — expand
                      raw JSON below.
                    </span>
                  }
                />
              )}
            </dl>
          )}
        </div>
      </div>

      <details className="mt-5 rounded-lg border border-[#C8D5B9]/60 bg-white/60">
        <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-[#5C564D] hover:text-[#2E2A24]">
          Raw snail JSON
        </summary>
        <pre className="overflow-x-auto border-t border-[#C8D5B9]/40 p-4 text-xs font-mono text-[#2E2A24]">
          {JSON.stringify(snail, null, 2)}
        </pre>
      </details>
    </section>
  );
}
