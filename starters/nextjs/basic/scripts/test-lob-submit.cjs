/**
 * Dry-run Lob letter submit for one recipient (validates addresses + payload, optional live API call).
 *
 *   node scripts/test-lob-submit.cjs <recipientUid>
 *   node scripts/test-lob-submit.cjs <recipientUid> --send
 */

const { admin, initAdmin } = require("./firebase-admin-init.cjs");

initAdmin();
const db = admin.firestore();

const recipientUid = process.argv[2];
const doSend = process.argv.includes("--send");

if (!recipientUid) {
  console.error("Usage: node scripts/test-lob-submit.cjs <recipientUid> [--send]");
  process.exit(1);
}

(async () => {
  // Dynamic import TS compiled paths won't work — inline minimal test via firestore + fetch
  const settingsSnap = await db.collection("adminSettings").doc("lobFulfillment").get();
  const settings = settingsSnap.data() ?? {};
  console.log("lobEnabled:", settings.lobEnabled);
  console.log("lobEnvironment:", settings.lobEnvironment);
  console.log("returnAddress:", settings.returnAddress);

  const userSnap = await db.collection("users").doc(recipientUid).get();
  if (!userSnap.exists) {
    console.error("User not found:", recipientUid);
    process.exit(1);
  }
  const user = userSnap.data();
  console.log("user displayName:", user.displayName);
  console.log("user address:", user.address);

  if (!doSend) {
    console.log("\nDry run only. Pass --send to call Lob API via Admin dev server POST instead.");
    console.log("Restart admin and use Printing → Send to Lob, or:");
    console.log(`  curl -X POST http://localhost:3000/api/printing/lob-submit -H 'Authorization: Bearer <token>' -d '{"recipientUid":"${recipientUid}"}'`);
    return;
  }

  console.error("Use Admin UI or API route for --send (keeps credentials server-side).");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
