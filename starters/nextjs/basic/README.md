# Snail Mail Admin

Next.js operations console for **Snail Mail Social**. It reads and updates the same Firestore data as the Flutter app (`SnailMailSocial/`) using the **Firebase Admin SDK** on the server, so you do not need to relax client Firestore rules for staff.

**Current dev mode:** **Authentication is disabled** — `/api/*` routes are open to anyone who can reach your dev server. Use only on `localhost` until sign-in is re-enabled for deployment.

## Features (first pass)

- **Users** — browse `users` docs, search by `usernames/{handle}` card, inspect mailing address + embedded snail.
- **Snail art** — list `snails` mirrors; edit level, XP, and `appearance` JSON; changes merge into `snails/{id}` and mirror into the owner’s `users` + `publicProfiles` snail when IDs match.
- **Printing** — physical fulfillment queue (eligible sends not yet marked printed/shipped), printable pack per user, mail-batch browser.

## Local setup

1. **Service account** — Firebase console → Project settings → Service accounts → **Generate new private key**. Treat this JSON as a secret.

2. Create `.env.local` in this folder. You need **Firebase Admin** credentials (private key). That is **not** the same as the Web app `apiKey` / `appId` snippet.

   **Get the key:** Firebase Console → **Project settings** (gear) → **Service accounts** → **Generate new private key** → save the `.json` file somewhere safe (do not commit it).

   Then use **either**:

   ```bash
   # Easiest locally — absolute path to the downloaded file
   GOOGLE_APPLICATION_CREDENTIALS=/Users/you/keys/snailmail-app-xxxxx.json
   ```

   ```bash
   # Or paste the entire JSON as one line
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```

3. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No web (`NEXT_PUBLIC_*`) config is required while auth is off, as long as Admin credentials are set.

## Re-enabling authentication (later)

When you add Firebase Auth back to this app, restore checks on `/api/*` (e.g. verify ID token + **`admin: true` custom claim**). Until then, do **not** deploy this build publicly.

You can still use **`npm run set-admin-claim -- email@example.com`** with `FIREBASE_SERVICE_ACCOUNT_JSON` set to grant the claim for when auth returns.

## Hosting overview

Host this like any Node server that needs **`FIREBASE_SERVICE_ACCOUNT_JSON`**. **Turn authentication back on before** exposing the site to the internet.

### Option A — Vercel (simplest for Next.js)

1. Push the `Admin/` tree to a GitHub repo (or use a monorepo with root set to `Admin`).
2. Import the project in Vercel; set Root Directory to `Admin` if needed.
3. Add environment variables (`FIREBASE_SERVICE_ACCOUNT_JSON`, and any auth-related vars once restored).
4. Deploy. Add `admin.snailmail.social` under Domains → point a `CNAME` to Vercel per their DNS instructions.

### Option B — AWS

Typical patterns:

- **Amplify Hosting** (Gen 2) with a Next.js app — configure env vars in the Amplify console; connect GitHub for CI.
- **ECS/Fargate** or **EC2** — build with `npm run build`, run `npm start` (port 3000) behind **Application Load Balancer**; store secrets in **AWS Secrets Manager** and inject at task launch.
- **S3 + CloudFront** alone is **not** enough — you need a compute target for the Admin SDK API routes.

For `admin.snailmail.social`, use **Route 53** (or your registrar) for DNS: `A`/`ALIAS` to the load balancer or `CNAME` to Amplify/Vercel as documented by that product.

### Option C — Firebase App Hosting (this repo)

This app lives at **`starters/nextjs/basic`** in [SnailMailAdmin](https://github.com/jameslear99/SnailMailAdmin) so Firebase App Hosting can deploy it from the forked [apphosting-adapters](https://github.com/firebase/apphosting-adapters) layout.

1. In Firebase console → **App Hosting** → create a backend connected to this repo.
2. Set **Root directory** to **`/starters/nextjs/basic`**.
3. Set **Live branch** to **`main`**.
4. On Cloud Run, the Admin SDK uses Application Default Credentials (`K_SERVICE` is set automatically). If Firestore/Storage access fails, add a secret for `FIREBASE_SERVICE_ACCOUNT_JSON` in `apphosting.yaml` and the Firebase console.
5. **Re-enable authentication before going live** — auth is currently disabled in dev.

See [Get started with App Hosting](https://firebase.google.com/docs/app-hosting/get-started).

## Security notes

- Never commit `.env.local` or service account JSON.
- **Do not expose this app without auth** — anyone could read/write Firestore via your API routes.
- The admin API can read PII (addresses). Restrict access and audit usage once deployed.
