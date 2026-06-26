"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

type SnailRow = {
  id: string;
  ownerUid?: string;
  name?: string;
  level?: number;
  xp?: number;
};

export default function SnailMirrorsPage() {
  const [rows, setRows] = useState<SnailRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownerUid, setOwnerUid] = useState("");

  const load = useCallback(async (cursor?: string | null, owner?: string) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "40" });
      if (cursor) params.set("cursor", cursor);
      if (owner?.trim()) params.set("ownerUid", owner.trim());
      const data = await apiJson<{
        snails: SnailRow[];
        nextCursor: string | null;
        note?: string;
      }>(`/api/snails?${params}`);
      if (owner?.trim()) {
        setRows(data.snails);
        setNextCursor(null);
      } else if (cursor) {
        setRows((prev) => [...prev, ...data.snails]);
        setNextCursor(data.nextCursor);
      } else {
        setRows(data.snails);
        setNextCursor(data.nextCursor);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <p>
        <Link href="/snails" className="text-sm text-[#4F6E43] hover:underline">
          ← Snail art catalog
        </Link>
      </p>
      <div>
        <h1 className="text-2xl font-semibold text-[#2E2A24]">User snail mirrors</h1>
        <p className="mt-1 text-[#5C564D]">
          Live embedded <code className="text-xs">snail</code> on each{" "}
          <code className="text-xs">users/&#123;uid&#125;</code> document (canonical).
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load(null, ownerUid);
        }}
      >
        <label className="text-sm">
          <span className="font-medium text-[#2E2A24]">Filter by owner uid</span>
          <input
            value={ownerUid}
            onChange={(e) => setOwnerUid(e.target.value)}
            placeholder="Firebase uid"
            className="mt-1 block w-72 max-w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 font-mono text-xs text-[#2E2A24] outline-none focus:border-[#4F6E43]"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
          disabled={busy}
        >
          Filter
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#2E2A24] hover:bg-[#F0F5EA]"
          disabled={busy}
          onClick={() => {
            setOwnerUid("");
            void load(null, "");
          }}
        >
          Clear
        </button>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#C8D5B9]/60 text-xs uppercase tracking-wide text-[#5C564D]">
            <tr>
              <th className="px-4 py-3 font-medium">Snail id</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Lvl / XP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#C8D5B9]/40">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link
                    href={`/snails/mirrors/${encodeURIComponent(r.id)}`}
                    className="text-[#4F6E43] hover:underline"
                  >
                    {r.id.slice(0, 10)}…
                  </Link>
                </td>
                <td className="px-4 py-3">{r.name ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.ownerUid ? (
                    <Link href={`/users/${encodeURIComponent(r.ownerUid)}`} className="text-[#4F6E43] hover:underline">
                      {r.ownerUid.slice(0, 8)}…
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.level ?? "—"} / {r.xp ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!ownerUid.trim() && nextCursor ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void load(nextCursor)}
          className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-60"
        >
          {busy ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
