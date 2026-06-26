"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/users", label: "Users" },
  { href: "/snails", label: "Snail art" },
  { href: "/printing", label: "Printing" },
  { href: "/ad-management", label: "Ad Management" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F3EE] text-[#2E2A24]">
      <header className="border-b border-[#C8D5B9]/60 bg-[#FDFBF7] print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight text-[#4F6E43]">
              Snail Mail Admin
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {nav.map(({ href, label }) => {
                const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-md px-2 py-1 transition-colors ${
                      active
                        ? "bg-[#E4ECD9] text-[#2E3D28] font-medium"
                        : "text-[#5C564D] hover:bg-[#EDF2E6]"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <p className="text-xs text-amber-900/80 bg-amber-100/80 border border-amber-200/80 rounded-md px-2 py-1">
            Local dev: authentication disabled
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 print:max-w-none print:px-8 print:py-4">{children}</main>
    </div>
  );
}
