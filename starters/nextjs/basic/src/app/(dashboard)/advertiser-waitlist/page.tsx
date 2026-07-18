"use client";

import { useCallback, useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

type WaitlistEntry = {
  id: string;
  name: string;
  email: string;
  source: string;
  createdAt: string | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdvertiserWaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiJson<{ entries: WaitlistEntry[] }>("/api/advertiser-waitlist");
      setEntries(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load waitlist");
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#2E2A24]">Advertiser waitlist</h1>
          <p className="mt-1 text-[#5C564D]">
            Early access signups from the public site (
            <code className="text-xs">advertiserWaitlist</code> in Firestore).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded-lg border border-[#C8D5B9] bg-white px-4 py-2 text-sm text-[#2E2A24] hover:bg-[#F0F5EA] disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <p className="text-sm text-[#5C564D]">
        {busy ? "Loading…" : `${entries.length} signup${entries.length === 1 ? "" : "s"}`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[#C8D5B9]/60 text-xs uppercase tracking-wide text-[#5C564D]">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Signed up</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && !busy ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[#5C564D]">
                  No signups yet.
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-t border-[#C8D5B9]/40">
                  <td className="px-4 py-3 font-medium text-[#2E2A24]">{entry.name}</td>
                  <td className="px-4 py-3">
                    <a
                      href={`mailto:${encodeURIComponent(entry.email)}`}
                      className="text-[#4F6E43] hover:underline"
                    >
                      {entry.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 capitalize text-[#5C564D]">{entry.source}</td>
                  <td className="px-4 py-3 text-[#5C564D]">{formatWhen(entry.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
