import Link from "next/link";

import { FriendCountBackfillButton } from "./maintenance-actions";

export default function DashboardHomePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#2E2A24]">Dashboard</h1>
        <p className="mt-1 text-[#5C564D]">
          Manage Snail Mail Social alongside the Flutter app — same Firebase project (
          <code className="rounded bg-[#E4ECD9] px-1 text-sm">snailmail-app</code>
          ).
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-3">
        <DashboardCard
          href="/users"
          title="Users"
          description="Private profiles, addresses, delivery eligibility."
        />
        <DashboardCard
          href="/snails"
          title="Snail art"
          description="Layered SVG/PNG parts (shell, body, face…); per-user snail data under /snails/mirrors (from users)."
        />
        <DashboardCard
          href="/printing"
          title="Printing &amp; fulfillment"
          description="Physical print/ship queue (new sends as they fan out), packs per user, and mail batch browser."
        />
      </ul>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5 text-sm text-[#5C564D]">
        <h2 className="font-medium text-[#2E2A24]">How this connects</h2>
        <p className="mt-2">
          The mobile app writes <code className="text-xs">users</code> (embedded <code className="text-xs">snail</code>),{" "}
          <code className="text-xs">publicProfiles</code>, <code className="text-xs">usernames</code>, and{" "}
          <code className="text-xs">mailPosts</code> under Firestore rules scoped to end users. Catalog assets for snail
          art live in <code className="text-xs">snailArtAssets</code> and Storage{" "}
          <code className="text-xs">snail-art-assets/</code>. This admin site uses the Firebase Admin SDK on the server,
          so it can read and write those resources without changing client security rules.
        </p>
      </section>

      <section className="rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5">
        <h2 className="font-medium text-[#2E2A24]">Maintenance</h2>
        <p className="mt-2 mb-3 text-sm text-[#5C564D]">
          Recompute <code className="text-xs">publicProfiles.friendsCount</code> for every user from the{" "}
          <code className="text-xs">friendships</code> collection. Use this to heal counts created before the
          friend-count Cloud Functions existed. Safe to run repeatedly.
        </p>
        <FriendCountBackfillButton />
      </section>
    </div>
  );
}

function DashboardCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block h-full rounded-xl border border-[#C8D5B9]/60 bg-[#FDFBF7] p-5 transition-colors hover:border-[#4F6E43]/50 hover:bg-white"
      >
        <h3 className="font-semibold text-[#4F6E43]">{title}</h3>
        <p className="mt-2 text-sm text-[#5C564D]">{description}</p>
      </Link>
    </li>
  );
}
