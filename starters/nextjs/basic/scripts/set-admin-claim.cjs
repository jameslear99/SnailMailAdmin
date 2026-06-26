/**
 * Grant or revoke admin custom claim on a Firebase Auth user.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}' \
 *     node scripts/set-admin-claim.cjs you@email.com
 *   node scripts/set-admin-claim.cjs <uid> --revoke
 *
 * After granting, the user must refresh their ID token (sign out & sign in).
 */

const admin = require("firebase-admin");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw || !raw.trim()) {
  console.error("Set FIREBASE_SERVICE_ACCOUNT_JSON to your service account JSON string.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(raw)),
  });
}

const auth = admin.auth();
const target = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!target) {
  console.error("Usage: node scripts/set-admin-claim.cjs <email-or-uid> [--revoke]");
  process.exit(1);
}

async function resolveUid(emailOrUid) {
  if (emailOrUid.includes("@")) {
    const user = await auth.getUserByEmail(emailOrUid.trim());
    return user.uid;
  }
  return emailOrUid.trim();
}

(async () => {
  try {
    const uid = await resolveUid(target);
    if (revoke) {
      const user = await auth.getUser(uid);
      const claims = { ...(user.customClaims ?? {}) };
      delete claims.admin;
      await auth.setCustomUserClaims(uid, claims);
      console.log(`Removed admin claim from ${uid} (${user.email ?? "no email"})`);
    } else {
      await auth.setCustomUserClaims(uid, { admin: true });
      const user = await auth.getUser(uid);
      console.log(`Granted admin:true to ${uid} (${user.email ?? "no email"})`);
      console.log("Have them sign out and sign in again so the new token includes the claim.");
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
