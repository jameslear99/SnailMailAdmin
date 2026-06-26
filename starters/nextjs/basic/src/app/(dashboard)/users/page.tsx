"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

type UserRow = {
  id: string;
  username?: string;
  displayName?: string;
  mailsDeliveredTotal?: number;
};

export default function UsersPage() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [usernameSearch, setUsernameSearch] = useState("");

  const load = useCallback(async (cursor?: string | null, username?: string) => {
      setBusy(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "30" });
        if (cursor) params.set("cursor", cursor);
        if (username?.trim()) params.set("username", username.trim().toLowerCase());
        const data = await apiJson<{ users: UserRow[]; nextCursor: string | null }>(
          `/api/users?${params}`,
        );
        if (username?.trim()) {
          setRows(data.users);
        } else if (cursor) {
          setRows((prev) => [...prev, ...data.users]);
        } else {
          setRows(data.users);
        }
        setNextCursor(data.nextCursor);
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
      <div>
        <h1 className="text-2xl font-semibold text-[#2E2A24]">Users</h1>
        <p className="mt-1 text-[#5C564D]">
          Private <code className="text-xs">users/&#123;uid&#125;</code> documents (PII — handle carefully).
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void load(null, usernameSearch);
        }}
      >
        <label className="text-sm">
          <span className="font-medium text-[#2E2A24]">Lookup by username</span>
          <input
            value={usernameSearch}
            onChange={(e) => setUsernameSearch(e.target.value)}
            placeholder="handle without @"
            className="mt-1 block rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-[#2E2A24] outline-none focus:border-[#4F6E43]"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-60"
          disabled={busy}
        >
          Search
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#2E2A24] hover:bg-[#F0F5EA]"
          disabled={busy}
          onClick={() => {
            setUsernameSearch("");
            void load(null, "");
          }}
        >
          Clear &amp; list
        </button>
      </form>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#C8D5B9]/60 text-xs uppercase tracking-wide text-[#5C564D]">
            <tr>
              <th className="px-4 py-3 font-medium">UID</th>
              <th className="px-4 py-3 font-medium">Username</th>
              <th className="px-4 py-3 font-medium">Display name</th>
              <th className="px-4 py-3 font-medium">Mail count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[#C8D5B9]/40">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/users/${encodeURIComponent(r.id)}`} className="text-[#4F6E43] hover:underline">
                    {r.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3">{r.username ?? "—"}</td>
                <td className="px-4 py-3">{r.displayName ?? "—"}</td>
                <td className="px-4 py-3">{r.mailsDeliveredTotal ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !busy ? (
          <p className="px-4 py-8 text-center text-[#5C564D]">No users loaded.</p>
        ) : null}
      </div>

      {!usernameSearch.trim() && nextCursor ? (
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
