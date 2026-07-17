# Snail Mail Admin

Next.js operations console for **Snail Mail Social**. It reads and updates the same Firestore data as the Flutter app (`SnailMailSocial/`) using the **Firebase Admin SDK** on the server, so you do not need to relax client Firestore rules for staff.

Access is gated by **Firebase Auth** with an **`admin: true` custom claim**. All `/api/*` routes verify the caller's ID token and reject non-admin users.

## Features

- **Users** — browse `users` docs, search by `usernames/{handle}` card, inspect mailing address + embedded snail; physical-mail entitlement overrides.
- **Snail art** — asset library (upload, validate, publish); per-user snail mirrors (level, XP, appearance).
- **Printing** — fulfillment queue, per-user + bulk print packs, Lob.com manual + auto submit, job tracking, mark fulfilled.

**v1 launch scope:** Subscription-funded physical mail only. **Ad Management** (campaign review, envelope ad policy) is deferred post-launch — hide or ignore that nav section until the ad tier ships. See `../RELEASE_ROADMAP.md`.

## Local setup

1. Copy `.env.example` → `.env.local` and fill in values (see below).

2. **Service account** — Firebase console → Project settings → Service accounts → **Generate new private key**. Treat this JSON as a secret. Set either:
   - `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json`, or
   - `FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}` (single line)

3. **Firebase client config** — same Web app config as the main project (`NEXT_PUBLIC_FIREBASE_*` in `.env.local`). Required for browser sign-in.

4. **Create your admin login** (email + password + `admin` claim in one step):

```bash
npm run create-admin-user -- your@email.com 'ChooseAStrongPassword'
```

If the email already exists in Firebase Auth, this resets the password and ensures the admin claim. To grant admin on an existing account without changing the password:

```bash
npm run set-admin-claim -- your@email.com
```

The user must **sign out and sign in again** (or use a fresh session) so their ID token includes the claim.

5. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login` until signed in with an admin account.

To add more admins after setup, use **Settings** in the nav (no CLI required).

## Authentication model

| Layer | Behavior |
|-------|----------|
| Dashboard UI | `AuthGate` redirects unauthenticated users to `/login` |
| `/api/*` routes | `requireAdminApi()` verifies `Authorization: Bearer <idToken>` and `admin: true` claim |
| Client fetches | `apiFetch` / `apiJson` attach the current user's ID token automatically |

To revoke access: `npm run set-admin-claim -- email@example.com -- --revoke`

## Hosting overview

Host this like any Node server with Firebase Admin credentials and client config.

### Option A — Vercel (simplest for Next.js)

1. Push the `Admin/` tree to a GitHub repo (or use a monorepo with root set to `Admin`).
2. Import the project in Vercel; set Root Directory to `Admin` if needed.
3. Add environment variables: `NEXT_PUBLIC_FIREBASE_*`, plus `FIREBASE_SERVICE_ACCOUNT_JSON` or rely on platform ADC if available.
4. Deploy. Add `admin.snailmail.social` under Domains.

### Option B — Firebase App Hosting

App Hosting auto-injects `FIREBASE_WEBAPP_CONFIG` when linked to a Firebase web app. Admin SDK uses Application Default Credentials on Cloud Run (`K_SERVICE`).

1. Link the backend to your Firebase web app in the App Hosting console.
2. Grant staff accounts the admin claim via `set-admin-claim`.
3. Deploy.

See [Get started with App Hosting](https://firebase.google.com/docs/app-hosting/get-started).

## Security notes

- Never commit `.env.local` or service account JSON.
- Only grant `admin: true` to trusted staff accounts.
- The admin API can read PII (addresses). Audit usage and restrict the admin domain where possible.
