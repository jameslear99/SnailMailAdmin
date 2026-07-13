"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/printing", label: "Queue" },
  { href: "/printing/jobs", label: "Print jobs" },
  { href: "/printing/settings", label: "Lob settings" },
  { href: "/printing/batches", label: "Batches" },
];

export function PrintingSubnav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-[#C8D5B9]/60 pb-3 text-sm">
      {tabs.map(({ href, label }) => {
        const active =
          href === "/printing"
            ? pathname === "/printing"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active
                ? "bg-[#E4ECD9] font-medium text-[#2E3D28]"
                : "text-[#5C564D] hover:bg-[#EDF2E6]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
