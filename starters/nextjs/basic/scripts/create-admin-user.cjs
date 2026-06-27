/**
 * Create an admin user (or reset password + ensure admin claim on existing user).
 *
 * Usage:
 *   npm run create-admin-user -- you@email.com 'YourPasswordHere'
 *
 * Reads credentials from Admin/.env.local
 */

const { admin, initAdmin } = require("./firebase-admin-init.cjs");

initAdmin();
const auth = admin.auth();
const db = admin.firestore();

const email = process.argv[2]?.trim();
const password = process.argv[3] ?? process.env.ADMIN_PASSWORD;

if (!email || !email.includes("@")) {
  console.error("Usage: npm run create-admin-user -- you@email.com 'YourPasswordHere'");
  process.exit(1);
}

if (!password || password.length < 6) {
  console.error("Password is required (min 6 characters). Pass as the second argument or set ADMIN_PASSWORD.");
  process.exit(1);
}

(async () => {
  try {
    let uid;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      await auth.updateUser(uid, { password });
      console.log(`Updated password for existing user ${uid} (${email})`);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
      const created = await auth.createUser({ email, password });
      uid = created.uid;
      console.log(`Created new user ${uid} (${email})`);
    }

    await auth.setCustomUserClaims(uid, { admin: true });
    await db.collection("adminUsers").doc(uid).set(
      {
        email: email.toLowerCase(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdByUid: null,
        createdByEmail: null,
      },
      { merge: true },
    );
    console.log(`Granted admin:true to ${email}`);
    console.log("Sign in at /login with this email and password.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
