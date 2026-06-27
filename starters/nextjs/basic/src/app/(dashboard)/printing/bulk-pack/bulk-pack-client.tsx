"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PostcardPrintSheets, type PrintPackSegment } from "@/components/printing/postcard-print-sheets";
import type { QueueDetailPayload } from "@/lib/build-print-queue-detail";
import type { PrintQueueItem } from "@/lib/print-fulfillment";

import { apiFetch, apiJson } from "@/lib/api-fetch";
import { captionFromMailPost, formatIsoShort } from "@/lib/postcard-print-utils";
import { mailingAddressLinesFromUserDoc } from "@/lib/mailing-address";

type BulkPayload = {
  segments: QueueDetailPayload[];
  recipientCount: number;
  totalCards: number;
};

function SegmentHeaderScreen({ seg }: { seg: QueueDetailPayload }) {
  const uid = seg.recipientUid;
  const displayName = seg.user && typeof seg.user.displayName === "string" ? seg.user.displayName : null;
  const username = seg.user && typeof seg.user.username === "string" ? seg.user.username : null;
  const addressLines =
    seg.addressLines && seg.addressLines.length > 0
      ? seg.addressLines
      : seg.user
        ? mailingAddressLinesFromUserDoc(seg.user)
        : [];

  return (
    <header className="border-b border-[#C8D5B9]/40 pb-4">
      <h2 className="text-xl font-semibold text-[#2E2A24]">Print mail (preview)</h2>
      {displayName ? <p className="mt-1 text-[#2E2A24]">{displayName}</p> : null}
      {username ? <p className="text-sm text-[#5C564D]">@{username}</p> : null}
      <p className="mt-2 font-mono text-xs text-[#5C564D]">{uid}</p>
      {!seg.user ? (
        <p className="mt-3 text-sm text-amber-800">User profile not found.</p>
      ) : addressLines.length > 0 ? (
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
  );
}

function PostcardScreenCard({
  item,
  cardLabel,
  setExpandedPhotoUrl,
}: {
  item: PrintQueueItem;
  cardLabel: string;
  setExpandedPhotoUrl: (url: string | null) => void;
}) {
  const photoUrl =
    item.mailPost && typeof item.mailPost.renderedFrontImageUrl === "string"
      ? item.mailPost.renderedFrontImageUrl
      : null;
  const caption = item.mailPost ? captionFromMailPost(item.mailPost) : "";

  return (
    <article className="rounded-lg border border-[#C8D5B9]/50 bg-[#FDFBF7] p-2.5">
      <div className="flex flex-row gap-3">
        <div className="shrink-0">
          {photoUrl ? (
            <button
              type="button"
              className="group relative block h-[4.5rem] w-[6.75rem] overflow-hidden rounded-md border border-[#C8D5B9]/70 bg-white shadow-sm outline-none ring-[#4F6E43] transition hover:border-[#4F6E43] focus-visible:ring-2"
              onClick={() => setExpandedPhotoUrl(photoUrl)}
              aria-label={`Enlarge postcard ${cardLabel}`}
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
          {item.mailPost ? (
            <>
              <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-xs leading-snug text-[#2E2A24]">
                {caption || "—"}
              </p>
              {typeof item.mailPost.senderSnailName === "string" ? (
                <p className="mt-1 text-[10px] text-[#5C564D]">From: {item.mailPost.senderSnailName}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-xs text-amber-800">Mail post document missing.</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-[#5C564D]">
        Print: this card uses one 4×6 sheet for the photo and a second sheet for this message.
      </p>
    </article>
  );
}

function toPrintSegments(segments: QueueDetailPayload[]): PrintPackSegment[] {
  return segments.map((seg) => ({
    recipientUid: seg.recipientUid,
    displayName: seg.user && typeof seg.user.displayName === "string" ? seg.user.displayName : null,
    username: seg.user && typeof seg.user.username === "string" ? seg.user.username : null,
    addressLines:
      seg.addressLines && seg.addressLines.length > 0
        ? seg.addressLines
        : seg.user
          ? mailingAddressLinesFromUserDoc(seg.user)
          : [],
    items: seg.items,
  }));
}

export function BulkPackClient() {
  const searchParams = useSearchParams();
  const recipientUidsParam = searchParams.get("recipientUids")?.trim() ?? "";

  const [data, setData] = useState<BulkPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!recipientUidsParam) {
      setData(null);
      setError("No recipients selected. Go back to Printing and choose recipients.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const j = await apiJson<BulkPayload>(
        `/api/printing/queue-detail-bulk?recipientUids=${encodeURIComponent(recipientUidsParam)}`,
      );
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [recipientUidsParam]);

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

  const orderedSegments = useMemo(() => data?.segments ?? [], [data?.segments]);
  const printSegments = useMemo(() => toPrintSegments(orderedSegments), [orderedSegments]);

  const sectionCards = useMemo(() => {
    if (!data) return [];
    return orderedSegments.map((seg) => ({
      seg,
      cards: seg.items.map((item, ii) => ({
        item,
        cardLabel: `${ii + 1}/${seg.items.length}`,
      })),
    }));
  }, [data, orderedSegments]);

  async function markAllFulfilled() {
    if (!data || orderedSegments.length === 0) return;
    const uids = orderedSegments.map((s) => s.recipientUid);
    setMarkBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/printing/mark-fulfilled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUids: uids }),
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

  const totalCards = data?.totalCards ?? 0;

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

      <div className="sn-only-screen space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/printing" className="text-[#4F6E43] hover:underline">
            ← Printing
          </Link>
          <button
            type="button"
            disabled={busy || !data || totalCards === 0}
            onClick={() => window.print()}
            className="rounded-lg bg-[#4F6E43] px-3 py-1.5 font-medium text-white hover:bg-[#3d5634] disabled:opacity-50"
          >
            Print all ({totalCards} card{totalCards === 1 ? "" : "s"})
          </button>
          <button
            type="button"
            disabled={markBusy || !data || totalCards === 0}
            onClick={() => void markAllFulfilled()}
            className="rounded-lg border border-[#C8D5B9] bg-white px-3 py-1.5 text-[#5C564D] hover:bg-[#F0F5EA] disabled:opacity-50"
          >
            {markBusy ? "Saving…" : "Record all as printed"}
          </button>
        </div>

        <p className="max-w-xl text-xs text-[#5C564D]">
          Print: 4×6 sheets — shipping divider per recipient, then photo + message per postcard.
        </p>

        <header className="border-b border-[#C8D5B9]/40 pb-4">
          <h1 className="text-2xl font-semibold text-[#2E2A24]">Bulk print pack</h1>
          {data ? (
            <p className="mt-1 text-sm text-[#5C564D]">
              {data.recipientCount} recipient{data.recipientCount === 1 ? "" : "s"} · {data.totalCards} postcard
              {data.totalCards === 1 ? "" : "s"} · order matches your selection on the Printing page
            </p>
          ) : null}
        </header>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {busy && !data ? <p className="text-[#5C564D]">Loading…</p> : null}

        {data && totalCards === 0 ? (
          <p className="text-[#5C564D]">Nothing to print for these recipients right now.</p>
        ) : null}

        {sectionCards.map(({ seg, cards }) => (
          <section key={seg.recipientUid} className="space-y-4">
            <SegmentHeaderScreen seg={seg} />
            {cards.length === 0 ? (
              <p className="text-sm text-[#5C564D]">No cards in queue for this recipient.</p>
            ) : (
              <div className="space-y-2">
                {cards.map(({ item, cardLabel }) => (
                  <PostcardScreenCard
                    key={`${seg.recipientUid}-${item.deliveryId}-${item.mailPostId}`}
                    item={item}
                    cardLabel={cardLabel}
                    setExpandedPhotoUrl={setExpandedPhotoUrl}
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <PostcardPrintSheets segments={printSegments} />
    </div>
  );
}
