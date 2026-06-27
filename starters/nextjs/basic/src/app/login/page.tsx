"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { authErrorMessage } from "@/lib/auth-errors";

function LoginForm() {
  const { signInEmail, configured, ready, user, isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && user && isAdmin) {
      router.replace(next);
    }
  }, [ready, user, isAdmin, next, router]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInEmail(email, password);
      router.replace(next);
    } catch (err) {
      setError(authErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#4F6E43]">Snail Mail Admin</h1>
        <p className="mt-1 text-sm text-[#5C564D]">Sign in with your admin email and password.</p>
      </div>

      {!configured ? (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Firebase is not configured. Add <code className="text-xs">NEXT_PUBLIC_FIREBASE_*</code>{" "}
          values to <code className="text-xs">.env.local</code>.
        </p>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <form onSubmit={handleEmail} className="space-y-4">
        <label className="block text-sm font-medium text-[#2E2A24]">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F6E43]"
          />
        </label>
        <label className="block text-sm font-medium text-[#2E2A24]">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#C8D5B9] bg-white px-3 py-2 text-sm outline-none focus:border-[#4F6E43]"
          />
        </label>
        <button
          type="submit"
          disabled={!configured || loading}
          className="w-full rounded-lg bg-[#4F6E43] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#3d5634] disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[#8A8278]">
        Need admin access? Ask an owner to run{" "}
        <code className="rounded bg-[#EDF2E6] px-1">npm run set-admin-claim</code>.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F3EE] px-4">
      <Suspense fallback={<div className="text-sm text-[#5C564D]">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
