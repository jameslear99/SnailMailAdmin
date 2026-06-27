"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { apiJson } from "@/lib/api-fetch";

type AdminUserRecord = {
  uid: string;
  email: string;
  createdAt: string | null;
  createdByUid: string | null;
  createdByEmail: string | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [revokingUid, setRevokingUid] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setLoadError(null);
    try {
      const data = await apiJson<{ admins: AdminUserRecord[] }>("/api/admin/users");
      setAdmins(data.admins);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load admins");
      setAdmins([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreating(true);
    try {
      await apiJson("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setCreateSuccess(`Admin access granted to ${email.trim()}. They can sign in at /login.`);
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create admin");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(target: AdminUserRecord) {
    if (target.uid === user?.uid) return;
    const ok = window.confirm(`Remove admin access for ${target.email}?`);
    if (!ok) return;

    setRevokingUid(target.uid);
    setCreateError(null);
    setCreateSuccess(null);
    try {
      await apiJson(`/api/admin/users/${encodeURIComponent(target.uid)}`, {
        method: "DELETE",
      });
      setCreateSuccess(`Removed admin access for ${target.email}.`);
      await load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to revoke admin");
    } finally {
      setRevokingUid(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#2E2A24]">Settings</h1>
        <p className="mt-1 text-[#5C564D]">
          Manage who can access this admin console. New admins sign in with email and password at{" "}
          <code className="rounded bg-[#E4ECD9] px-1 text-sm">/login</code>.
        </p>
      </div>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
        <h2 className="font-medium text-[#2E2A24]">Add admin</h2>
        <p className="mt-1 text-sm text-[#5C564D]">
          Creates a Firebase Auth account if needed, sets their password, and grants{" "}
          <code className="text-xs">admin: true</code>. Share the password securely — it is not
          emailed automatically.
        </p>

        {createError ? (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {createError}
          </p>
        ) : null}
        {createSuccess ? (
          <p className="mt-3 rounded-md border border-[#C8D5B9] bg-[#E4ECD9]/40 px-3 py-2 text-sm text-[#2E3D28]">
            {createSuccess}
          </p>
        ) : null}

        <form onSubmit={handleCreate} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[#2E2A24]">
            Email
            <input
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F6E43]"
            />
          </label>
          <label className="block text-sm font-medium text-[#2E2A24]">
            Password
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F6E43]"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-[#4F6E43] px-4 py-2 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create admin"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
        <h2 className="font-medium text-[#2E2A24]">Admin accounts</h2>
        {loadError ? (
          <p className="mt-2 text-sm text-red-700">{loadError}</p>
        ) : busy ? (
          <p className="mt-2 text-sm text-[#5C564D]">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="mt-2 text-sm text-[#5C564D]">
            No admins indexed yet. Admins created via the CLI before this page existed will still
            work — re-add them above to appear in this list.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#C8D5B9]/60 text-[#5C564D]">
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Added</th>
                  <th className="pb-2 pr-4 font-medium">Added by</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {admins.map((row) => {
                  const isSelf = row.uid === user?.uid;
                  return (
                    <tr key={row.uid} className="border-b border-[#C8D5B9]/30">
                      <td className="py-2 pr-4">
                        {row.email}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-[#8A8278]">(you)</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 text-[#5C564D]">{formatWhen(row.createdAt)}</td>
                      <td className="py-2 pr-4 text-[#5C564D]">
                        {row.createdByEmail ?? "—"}
                      </td>
                      <td className="py-2 text-right">
                        {isSelf ? null : (
                          <button
                            type="button"
                            disabled={revokingUid === row.uid}
                            onClick={() => void handleRevoke(row)}
                            className="text-red-700 hover:underline disabled:opacity-50"
                          >
                            {revokingUid === row.uid ? "Removing…" : "Remove"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
