"use client";

import { useMemo } from "react";

import type { PrintQueueItem } from "@/lib/print-fulfillment";
import { captionFromMailPost, formatIsoShort } from "@/lib/postcard-print-utils";

import "./postcard-print.css";

export type PrintPackSegment = {
  recipientUid: string;
  displayName: string | null;
  username: string | null;
  addressLines: string[];
  items: PrintQueueItem[];
};

type SheetModel =
  | { kind: "divider"; seg: PrintPackSegment }
  | { kind: "photo"; seg: PrintPackSegment; item: PrintQueueItem }
  | {
      kind: "caption";
      seg: PrintPackSegment;
      item: PrintQueueItem;
      cardLabel: string;
    };

function buildSheetModels(segments: PrintPackSegment[]): SheetModel[] {
  const sheets: SheetModel[] = [];
  for (const seg of segments) {
    if (seg.items.length === 0) continue;
    sheets.push({ kind: "divider", seg });
    for (let ii = 0; ii < seg.items.length; ii++) {
      const item = seg.items[ii];
      sheets.push({ kind: "photo", seg, item });
      sheets.push({
        kind: "caption",
        seg,
        item,
        cardLabel: `${ii + 1}/${seg.items.length}`,
      });
    }
  }
  return sheets;
}

function DividerSheet({
  seg,
  postcardCount,
  isLast,
}: {
  seg: PrintPackSegment;
  postcardCount: number;
  isLast: boolean;
}) {
  const name = seg.displayName ?? "Unknown recipient";
  const lines = seg.addressLines;

  return (
    <section className={`sn-print-page sn-print-divider ${isLast ? "sn-print-page--last" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#555]">Shipping divider</p>
      <h2>{name}</h2>
      {seg.username ? <p className="sn-print-divider-meta">@{seg.username}</p> : null}
      {lines.length > 0 ? (
        <address>
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </address>
      ) : (
        <p className="text-[10pt] text-amber-900">No address on file — update user before mailing.</p>
      )}
      <p className="sn-print-count">Postcards in this pack: {postcardCount}</p>
      <p className="sn-print-uid">{seg.recipientUid}</p>
    </section>
  );
}

function PhotoSheet({ photoUrl, isLast }: { photoUrl: string | null; isLast: boolean }) {
  return (
    <section className={`sn-print-page sn-print-photo ${isLast ? "sn-print-page--last" : ""}`}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- print pipeline needs reliable sizing
        <img src={photoUrl} alt="" className="sn-print-photo-img" />
      ) : (
        <p className="text-center text-sm text-[#555]">No image for this send</p>
      )}
    </section>
  );
}

function CaptionSheet({
  item,
  cardLabel,
  isLast,
}: {
  item: PrintQueueItem;
  cardLabel: string;
  isLast: boolean;
}) {
  const caption = item.mailPost ? captionFromMailPost(item.mailPost) : "";
  const from =
    item.mailPost && typeof item.mailPost.senderSnailName === "string"
      ? item.mailPost.senderSnailName
      : null;

  return (
    <section className={`sn-print-page sn-print-caption ${isLast ? "sn-print-page--last" : ""}`}>
      <p className="sn-cap-label">
        Message (back) · Card {cardLabel} · {item.mailPostId.slice(0, 12)}…
      </p>
      <div className="sn-cap-body">{caption || "—"}</div>
      {from ? <p className="sn-cap-from">From: {from}</p> : null}
      <p className="sn-cap-status">
        {item.deliveryStatus ?? "—"} · unlock {formatIsoShort(item.digitalUnlockAt)}
      </p>
    </section>
  );
}

/** Hidden on screen; visible when printing. 4×6 landscape sheets: divider, then photo + caption per card. */
export function PostcardPrintSheets({ segments }: { segments: PrintPackSegment[] }) {
  const sheets = useMemo(() => buildSheetModels(segments), [segments]);

  if (sheets.length === 0) return null;

  return (
    <div className="sn-only-print" aria-hidden>
      {sheets.map((m, i) => {
        const isLast = i === sheets.length - 1;
        if (m.kind === "divider") {
          return (
            <DividerSheet
              key={`div-${m.seg.recipientUid}`}
              seg={m.seg}
              postcardCount={m.seg.items.length}
              isLast={isLast}
            />
          );
        }
        if (m.kind === "photo") {
          const url =
            m.item.mailPost && typeof m.item.mailPost.renderedFrontImageUrl === "string"
              ? m.item.mailPost.renderedFrontImageUrl
              : null;
          return <PhotoSheet key={`pho-${m.seg.recipientUid}-${m.item.deliveryId}`} photoUrl={url} isLast={isLast} />;
        }
        return (
          <CaptionSheet
            key={`cap-${m.seg.recipientUid}-${m.item.deliveryId}`}
            item={m.item}
            cardLabel={m.cardLabel}
            isLast={isLast}
          />
        );
      })}
    </div>
  );
}
