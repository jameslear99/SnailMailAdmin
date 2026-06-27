const fs = require("fs");
const path = require("path");

const admin = require("firebase-admin");

const ADMIN_ROOT = path.resolve(__dirname, "..");

/** Load `.env.local` so npm scripts pick up GOOGLE_APPLICATION_CREDENTIALS. */
function loadEnvLocal() {
  const envPath = path.join(ADMIN_ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function initAdmin() {
  loadEnvLocal();

  if (admin.apps.length) return admin.app();

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(json)) });
  }

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credPath) {
    const resolved = path.isAbsolute(credPath) ? credPath : path.join(ADMIN_ROOT, credPath);
    if (!fs.existsSync(resolved)) {
      console.error(`GOOGLE_APPLICATION_CREDENTIALS file not found: ${resolved}`);
      process.exit(1);
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolved;
    return admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }

  console.error(
    "Missing credentials. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON in Admin/.env.local",
  );
  process.exit(1);
}

async function resolveUid(auth, emailOrUid) {
  if (emailOrUid.includes("@")) {
    const user = await auth.getUserByEmail(emailOrUid.trim());
    return user.uid;
  }
  return emailOrUid.trim();
}

module.exports = { admin, initAdmin, resolveUid };
