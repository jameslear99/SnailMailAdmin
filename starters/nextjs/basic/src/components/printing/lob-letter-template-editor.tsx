"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { apiJson } from "@/lib/api-fetch";
import type { LobLetterFormatSettings } from "@/lib/lob-letter-format";
import type { LobFulfillmentSettings } from "@/lib/lob-fulfillment-settings";
import {
  LOB_LETTER_LAYOUT_FIELDS,
  type LobLetterLayoutSettings,
} from "@/lib/lob-letter-template";

type PreviewResponse = {
  html: string;
  pageCount: number;
  recipientSnailStatus: string;
  recipientSnailResolved: boolean;
};

type Props = {
  letterFormat: LobLetterFormatSettings;
  letterLayout: LobLetterLayoutSettings;
  doubleSided: boolean;
  onLetterLayoutChange: (patch: Partial<LobLetterLayoutSettings>) => void;
};

const GROUP_LABELS: Record<(typeof LOB_LETTER_LAYOUT_FIELDS)[number]["group"], string> = {
  cover: "Cover page",
  posts: "Postcard quadrants",
  typography: "Typography",
  page: "Page",
};

export function LobLetterTemplateEditor({
  letterFormat,
  letterLayout,
  doubleSided,
  onLetterLayoutChange,
}: Props) {
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipientUid, setRecipientUid] = useState("");
  const [useRealRecipientSnail, setUseRealRecipientSnail] = useState(false);
  const [snailStatus, setSnailStatus] = useState<string | null>(null);

  const layoutGroups = useMemo(() => {
    const groups = new Map<string, typeof LOB_LETTER_LAYOUT_FIELDS>();
    for (const field of LOB_LETTER_LAYOUT_FIELDS) {
      const list = groups.get(field.group) ?? [];
      list.push(field);
      groups.set(field.group, list);
    }
    return groups;
  }, []);

  const refreshPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<PreviewResponse>("/api/printing/lob-letter-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterFormat,
          letterLayout,
          doubleSided,
          previewMode: !useRealRecipientSnail,
          useRealRecipientSnail,
          recipientUid: recipientUid.trim() || undefined,
        }),
      });
      setPreviewHtml(res.html);
      setPageCount(res.pageCount);
      setSnailStatus(res.recipientSnailStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [doubleSided, letterFormat, letterLayout, recipientUid, useRealRecipientSnail]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPreview();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [refreshPreview]);

  return (
    <div className="mt-6 border-t border-[#E8E4DC] pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#2E2A24]">Letter template preview</h3>
          <p className="mt-1 max-w-2xl text-sm text-[#5C564D]">
            Adjust spacing and sizing here — saved settings are used for every Lob submission.
            Placeholder boxes stand in for photos and snails until you test a real recipient.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshPreview()}
          disabled={loading}
          className="rounded-lg border border-[#C8D5B9] px-3 py-1.5 text-sm text-[#2E2A24] hover:bg-[#F6F9F2] disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh preview"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="space-y-5">
          <div className="rounded-lg border border-[#C8D5B9]/60 bg-[#FDFBF7] p-4">
            <h4 className="text-sm font-medium text-[#2E2A24]">Test recipient snail</h4>
            <p className="mt-1 text-xs text-[#5C564D]">
              Optional: load the current snail from Firebase for a real user UID.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useRealRecipientSnail}
                onChange={(e) => setUseRealRecipientSnail(e.target.checked)}
                className="h-4 w-4 rounded border-[#C8D5B9] accent-[#4F6E43]"
              />
              Load real snail from Firebase
            </label>
            <label className="mt-3 block text-sm">
              <span className="font-medium text-[#2E2A24]">Recipient UID</span>
              <input
                type="text"
                value={recipientUid}
                onChange={(e) => setRecipientUid(e.target.value)}
                placeholder="Firebase user UID"
                className="mt-1 w-full rounded-lg border border-[#C8D5B9] px-3 py-2 font-mono text-xs"
              />
            </label>
            {snailStatus ? (
              <p className="mt-2 text-xs text-[#5C564D]">
                Snail status: <code className="text-[11px]">{snailStatus}</code>
              </p>
            ) : null}
          </div>

          {(["cover", "posts", "typography", "page"] as const).map((group) => {
            const fields = layoutGroups.get(group);
            if (!fields?.length) return null;
            return (
              <div key={group} className="rounded-lg border border-[#C8D5B9]/60 bg-white p-4">
                <h4 className="text-sm font-medium text-[#2E2A24]">{GROUP_LABELS[group]}</h4>
                <div className="mt-3 grid gap-3">
                  {fields.map((field) => (
                    <label key={field.key} className="block text-sm">
                      <span className="text-[#2E2A24]">{field.label}</span>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="number"
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          value={letterLayout[field.key]}
                          onChange={(e) =>
                            onLetterLayoutChange({
                              [field.key]: Number(e.target.value),
                            })
                          }
                          className="w-full rounded-lg border border-[#C8D5B9] px-2 py-1.5"
                        />
                        <span className="shrink-0 text-xs text-[#5C564D]">{field.unit}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs text-[#5C564D]">
            <span>{pageCount} page(s) · {doubleSided ? "double-sided" : "single-sided"}</span>
            <span>Preview scale ~72%</span>
          </div>
          <div className="overflow-auto rounded-xl border border-[#C8D5B9]/80 bg-[#E8E4DC] p-3">
            {previewHtml ? (
              <iframe
                title="Lob letter template preview"
                srcDoc={previewHtml}
                className="mx-auto block border-0 bg-white shadow-sm"
                style={{
                  width: "612px",
                  height: `${Math.max(792, pageCount * 820)}px`,
                  transform: "scale(0.72)",
                  transformOrigin: "top center",
                }}
              />
            ) : (
              <div className="flex h-96 items-center justify-center text-sm text-[#5C564D]">
                {loading ? "Generating preview…" : "Preview will appear here"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { LobFulfillmentSettings };
