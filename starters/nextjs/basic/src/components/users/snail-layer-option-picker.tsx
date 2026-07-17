"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { renderSnailPreview } from "@/lib/render-snail-preview-png";
import type { SnailArtRecolorPolicy } from "@/lib/snail-art-recolor-policy";
import { compareSnailArtPaintOrder, type SnailArtCategory } from "@/lib/snail-art-types";
import {
  tintsForLayersFromColors,
  type PreviewSlotColors,
} from "@/lib/snail-preview-tint";
import type { ParsedSnailLook } from "@/lib/parse-snail-look";

type AssetRow = {
  id: string;
  category?: string;
  slug?: string;
  displayName?: string;
  recolorable?: boolean;
  stackOrder?: number;
};

const THUMB_PX = 72;

function assetLabel(asset: AssetRow | undefined, fallbackId: string): string {
  if (!asset) return fallbackId.slice(0, 12) + "…";
  return asset.displayName?.trim() || asset.slug?.trim() || asset.id.slice(0, 12) + "…";
}

function previewFingerprint(
  look: ParsedSnailLook,
  layers: AssetRow[],
  tints: (string | null)[],
): string {
  return [
    look.antennaAssetId,
    look.bodyAssetId,
    look.shellAssetId,
    look.faceAssetId,
    look.accessoryAssetId ?? "",
    look.antennaColor,
    look.bodyColor,
    look.shellColor,
    layers.map((l) => l.id).join(","),
    tints.join(","),
  ].join("|");
}

function SnailOptionThumb({
  look,
  assets,
  recolorPolicy,
  selected,
  label,
  onSelect,
}: {
  look: ParsedSnailLook;
  assets: AssetRow[];
  recolorPolicy: SnailArtRecolorPolicy;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);

  const { layers, tints, fingerprint } = useMemo(() => {
    const byId = new Map(assets.map((a) => [a.id, a]));
    const ids = [
      look.antennaAssetId,
      look.bodyAssetId,
      look.shellAssetId,
      look.faceAssetId,
      ...(look.accessoryAssetId ? [look.accessoryAssetId] : []),
    ];
    const resolved = ids
      .map((id) => byId.get(id))
      .filter((layer): layer is AssetRow => Boolean(layer))
      .sort(compareSnailArtPaintOrder);
    const colors: PreviewSlotColors = {
      body: look.bodyColor,
      shell: look.shellColor,
      antenna: look.antennaColor,
    };
    const resolvedTints = tintsForLayersFromColors(resolved, colors, recolorPolicy);
    return {
      layers: resolved,
      tints: resolvedTints,
      fingerprint: previewFingerprint(look, resolved, resolvedTints),
    };
  }, [look, assets, recolorPolicy]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || layers.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    void renderSnailPreview(canvas, layers, tints, THUMB_PX).catch(() => {
      /* Thumbnail failures are non-fatal */
    });
  }, [visible, layers, tints, fingerprint]);

  return (
    <button
      ref={rootRef}
      type="button"
      onClick={onSelect}
      title={label}
      className={`flex w-[5.5rem] flex-col items-center gap-1 rounded-lg border bg-white p-1.5 text-left transition-colors ${
        selected
          ? "border-[#4F6E43] ring-2 ring-[#4F6E43]/30"
          : "border-[#C8D5B9]/80 hover:border-[#4F6E43]/50 hover:bg-[#F0F5EA]"
      }`}
    >
      <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-md bg-[linear-gradient(145deg,#f6f9f2_0%,#e8efe0_100%)]">
        <canvas
          ref={canvasRef}
          width={THUMB_PX}
          height={THUMB_PX}
          className="max-h-full max-w-full object-contain"
          aria-hidden
        />
      </div>
      <span className="w-full truncate text-center text-[10px] leading-tight text-[#5C564D]">
        {label}
      </span>
    </button>
  );
}

export function SnailLayerOptionPicker({
  category,
  options,
  selectedAssetId,
  baseLook,
  assets,
  recolorPolicy,
  onSelect,
}: {
  category: SnailArtCategory;
  options: AssetRow[];
  selectedAssetId: string;
  baseLook: ParsedSnailLook;
  assets: AssetRow[];
  recolorPolicy: SnailArtRecolorPolicy;
  onSelect: (assetId: string) => void;
}) {
  function lookWithAsset(assetId: string): ParsedSnailLook {
    switch (category) {
      case "antenna":
        return { ...baseLook, antennaAssetId: assetId };
      case "body":
        return { ...baseLook, bodyAssetId: assetId };
      case "shell":
        return { ...baseLook, shellAssetId: assetId };
      case "face":
        return { ...baseLook, faceAssetId: assetId };
      case "accessory":
        return { ...baseLook, accessoryAssetId: assetId || undefined };
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {category === "accessory" ? (
        <SnailOptionThumb
          look={lookWithAsset("")}
          assets={assets}
          recolorPolicy={recolorPolicy}
          selected={!selectedAssetId}
          label="None"
          onSelect={() => onSelect("")}
        />
      ) : null}
      {options.map((asset) => (
        <SnailOptionThumb
          key={asset.id}
          look={lookWithAsset(asset.id)}
          assets={assets}
          recolorPolicy={recolorPolicy}
          selected={selectedAssetId === asset.id}
          label={assetLabel(asset, asset.id)}
          onSelect={() => onSelect(asset.id)}
        />
      ))}
    </div>
  );
}
