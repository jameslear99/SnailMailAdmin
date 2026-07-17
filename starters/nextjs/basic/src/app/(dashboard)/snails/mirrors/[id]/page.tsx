"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiJson } from "@/lib/api-fetch";

/** Legacy route — redirects to the owner's user detail page where snail editing lives. */
export default function SnailMirrorRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = decodeURIComponent(String(params.id ?? ""));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<{ ownerUid?: string }>(`/api/snails/${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (data.ownerUid) {
          router.replace(`/users/${encodeURIComponent(data.ownerUid)}`);
          return;
        }
        setError("Snail owner not found.");
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load snail");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <div className="space-y-4">
      <p>
        <Link href="/snails/mirrors" className="text-sm text-[#4F6E43] hover:underline">
          ← User snail mirrors
        </Link>
      </p>
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : (
        <p className="text-sm text-[#5C564D]">Redirecting to user profile…</p>
      )}
    </div>
  );
}
