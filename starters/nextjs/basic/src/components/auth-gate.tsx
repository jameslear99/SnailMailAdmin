"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, configured, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!ready) return;
    if (!configured || !isAdmin) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, configured, isAdmin, pathname, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F3EE] text-[#5C564D]">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (!configured || !isAdmin) return null;

  return children;
}
