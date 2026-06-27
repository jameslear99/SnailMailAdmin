/**
 * Grant or revoke admin custom claim on a Firebase Auth user.
 *
 * Usage:
 *   npm run set-admin-claim -- you@email.com
 *   npm run set-admin-claim -- you@email.com -- --revoke
 *
 * Reads credentials from Admin/.env.local
 */

const { admin, initAdmin, resolveUid } = require("./firebase-admin-init.cjs");

initAdmin();

const auth = admin.auth();
const db = admin.firestore();
const target = process.argv[2];
const revoke = process.argv.includes("--revoke");

if (!target) {
  console.error("Usage: npm run set-admin-claim -- <email-or-uid> [-- --revoke]");
  process.exit(1);
}

(async () => {
  try {
    const uid = await resolveUid(auth, target);
    if (revoke) {
      const user = await auth.getUser(uid);
      const claims = { ...(user.customClaims ?? {}) };
      delete claims.admin;
      await auth.setCustomUserClaims(uid, claims);
      await db.collection("adminUsers").doc(uid).delete();
      console.log(`Removed admin claim from ${uid} (${user.email ?? "no email"})`);
    } else {
      await auth.setCustomUserClaims(uid, { admin: true });
      const user = await auth.getUser(uid);
      await db.collection("adminUsers").doc(uid).set(
        {
          email: (user.email ?? "").toLowerCase(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdByUid: null,
          createdByEmail: null,
        },
        { merge: true },
      );
      console.log(`Granted admin:true to ${uid} (${user.email ?? "no email"})`);
      console.log("Have them sign out and sign in again so the new token includes the claim.");
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
