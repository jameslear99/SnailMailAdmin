"use client";

import { useState } from "react";

type BackfillResult = {
  ok: boolean;
  usersUpdated: number;
  friendshipsScanned: number;
};

export function FriendCountBackfillButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    setIsError(false);
    try {
      const res = await fetch("/api/friends/backfill-counts", {
        method: "POST",
      });
      const text = await res.text();
      if (!res.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* keep raw text */
        }
        throw new Error(msg);
      }
      const j = JSON.parse(text) as BackfillResult;
      setMessage(
        `Done — recomputed friendsCount for ${j.usersUpdated} user${
          j.usersUpdated === 1 ? "" : "s"
        } (scanned ${j.friendshipsScanned} friendship${
          j.friendshipsScanned === 1 ? "" : "s"
        }).`,
      );
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="rounded-lg bg-[#4F6E43] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-50"
      >
        {busy ? "Recomputing…" : "Recompute friend counts"}
      </button>
      {message ? (
        <p
          className={`text-sm ${
            isError ? "text-red-700" : "text-[#4F6E43]"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
