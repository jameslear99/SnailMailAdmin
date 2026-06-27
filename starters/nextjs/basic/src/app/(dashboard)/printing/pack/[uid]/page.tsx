"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PostcardPrintSheets, type PrintPackSegment } from "@/components/printing/postcard-print-sheets";
import type { PrintQueueItem } from "@/lib/print-fulfillment";

import { apiFetch, apiJson } from "@/lib/api-fetch";
import { captionFromMailPost, formatIsoShort } from "@/lib/postcard-print-utils";
import { mailingAddressLinesFromUserDoc } from "@/lib/mailing-address";

type QueueDetailPayload = {
  recipientUid: string;
  user: Record<string, unknown> | null;
  addressLines?: string[];
  items: PrintQueueItem[];
  count: number;
};

export default function PrintPackPage() {
  const params = useParams();
  const uid = decodeURIComponent(String(params.uid ?? ""));
  const [data, setData] = useState<QueueDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    setBusy(true);
    setError(null);
    try {
      const j = await apiJson<QueueDetailPayload>(
        `/api/printing/queue-detail?recipientUid=${encodeURIComponent(uid)}`,
      );
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [uid]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!expandedPhotoUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpandedPhotoUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedPhotoUrl]);

  const printSegments = useMemo((): PrintPackSegment[] => {
    if (!data) return [];
    const addressLines =
      data.addressLines && data.addressLines.length > 0
        ? data.addressLines
        : data.user
          ? mailingAddressLinesFromUserDoc(data.user)
          : [];
    return [
      {
        recipientUid: data.recipientUid,
        displayName: data.user && typeof data.user.displayName === "string" ? data.user.displayName : null,
        username: data.user && typeof data.user.username === "string" ? data.user.username : null,
        addressLines,
        items: data.items,
      },
    ];
  }, [data]);

  async function markFulfilled() {
    if (!uid) return;
    setMarkBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/printing/mark-fulfilled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUid: uid }),
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setMarkBusy(false);
    }
  }

  const displayName = data?.user && typeof data.user.displayName === "string" ? data.user.displayName : null;
  const username = data?.user && typeof data.user.username === "string" ? data.user.username : null;
  const addressLines =
    data?.addressLines && data.addressLines.length > 0
      ? data.addressLines
      : data?.user
        ? mailingAddressLinesFromUserDoc(data.user)
        : [];

  return (
    <div className="snailmail-print-pack space-y-6">
      {expandedPhotoUrl ? (
        <div
          className="print:hidden fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged postcard"
          onClick={() => setExpandedPhotoUrl(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-[#2E2A24] shadow-md hover:bg-[#F0F5EA]"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedPhotoUrl(null);
            }}
          >
            Close
          </button>
          <div className="max-h-[min(90vh,900px)] max-w-[min(96vw,56rem)]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- modal needs intrinsic sizing */}
            <img
              src={expandedPhotoUrl}
              alt=""
              className="max-h-[min(90vh,900px)] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />
          </div>
          <p className="pointer-events-none absolute bottom-6 left-0 right-0 text-center text-xs text-white/80">
            Click outside or press Esc to close
          </p>
        </div>
      ) : null}

      <div className="sn-only-screen space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/printing" className="text-[#4F6E43] hover:underline">
            ← Printing
          </Link>
          {username ? (
            <Link href={`/users/${encodeURIComponent(uid)}`} className="text-[#4F6E43] hover:underline">
              User profile
            </Link>
          ) : null}
          <button
            type="button"
            disabled={busy || !data || data.count === 0}
            onClick={() => window.print()}
            className="rounded-lg bg-[#4F6E43] px-3 py-1.5 font-medium text-white hover:bg-[#3d5634] disabled:opacity-50"
          >
            Print mail
          </button>
          <button
            type="button"
            disabled={markBusy || !data || data.count === 0}
            onClick={() => void markFulfilled()}
            className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-1.5 text-[#5C564D] hover:bg-[#F0F5EA] disabled:opacity-50"
          >
            {markBusy ? "Saving…" : "Record as printed"}
          </button>
        </div>

        <p className="max-w-xl text-xs text-[#5C564D]">
          Print: 4×6 sheets — shipping divider, then photo + message per postcard.
        </p>

        <header className="border-b border-[#C8D5B9]/40 pb-4">
          <h1 className="text-2xl font-semibold text-[#2E2A24]">Print mail (preview)</h1>
          {displayName ? <p className="mt-1 text-[#2E2A24]">{displayName}</p> : null}
          {username ? <p className="text-sm text-[#5C564D]">@{username}</p> : null}
          <p className="mt-2 font-mono text-xs text-[#5C564D]">{uid}</p>
          {addressLines.length > 0 ? (
            <div className="mt-4 rounded-lg border border-[#C8D5B9]/60 bg-white p-4 text-sm leading-relaxed">
              <p className="text-xs font-medium uppercase tracking-wide text-[#5C564D]">Ship to</p>
              {addressLines.map((line) => (
                <p key={line} className="text-[#2E2A24]">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-800">No mailing address on user profile.</p>
          )}
        </header>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {busy && !data ? <p className="text-[#5C564D]">Loading…</p> : null}

        {data && data.count === 0 ? (
          <p className="text-[#5C564D]">Nothing to print or ship for this user right now.</p>
        ) : null}

        {data && data.items.length > 0 ? (
          <div className="space-y-2">
            {data.items.map((item, i) => {
              const photoUrl =
                item.mailPost && typeof item.mailPost.renderedFrontImageUrl === "string"
                  ? item.mailPost.renderedFrontImageUrl
                  : null;
              const caption = item.mailPost ? captionFromMailPost(item.mailPost) : "";
              const cardLabel = `${i + 1}/${data.items.length}`;

              return (
                <article key={`${item.deliveryId}-${item.mailPostId}`} className="rounded-lg border border-[#C8D5B9]/50 bg-[#FDFBF7] p-2.5">
                  <div className="flex flex-row gap-3">
                    <div className="shrink-0">
                      {photoUrl ? (
                        <button
                          type="button"
                          className="group relative block h-[4.5rem] w-[6.75rem] overflow-hidden rounded-md border border-[#C8D5B9]/70 bg-white shadow-sm outline-none ring-[#4F6E43] transition hover:border-[#4F6E43] focus-visible:ring-2"
                          onClick={() => setExpandedPhotoUrl(photoUrl)}
                          aria-label={`Enlarge postcard ${i + 1}`}
                        >
                          <Image src={photoUrl} alt="" fill sizes="108px" className="object-cover" unoptimized />
                          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent py-1 text-center text-[9px] font-medium text-white opacity-90">
                            Click to enlarge
                          </span>
                        </button>
                      ) : (
                        <p className="w-[6.75rem] text-[10px] text-[#5C564D]">No photo</p>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] leading-tight text-[#5C564D]">
                        <span className="font-medium text-[#2E2A24]">Card {cardLabel}</span>
                        <span className="mx-1.5 text-[#C8D5B9]">·</span>
                        <span className="font-mono">{item.mailPostId.slice(0, 10)}…</span>
                        <span className="mx-1.5 text-[#C8D5B9]">·</span>
                        {item.deliveryStatus ?? "—"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#5C564D]">
                        Unlock {formatIsoShort(item.digitalUnlockAt)}
                      </p>
                      {item.deliveryStatus === "missing_address" ? (
                        <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-950">
                          missing_address — add address before shipping.
                        </p>
                      ) : null}
                      {item.mailPost ? (
                        <>
                          <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs leading-snug text-[#2E2A24]">
                            {caption || "—"}
                          </p>
                          {typeof item.mailPost.senderSnailName === "string" ? (
                            <p className="mt-1 text-[10px] text-[#5C564D]">
                              From: {item.mailPost.senderSnailName}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-amber-800">Mail post document missing.</p>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[#5C564D]">
                    Print output: one 4×6 sheet for the photo, then one for this message (see shipping divider first).
                  </p>
                </article>
              );
            })}
          </div>
        ) : null}
      </div>

      <PostcardPrintSheets segments={printSegments} />
    </div>
  );
}
