import * as admin from "firebase-admin";

const DEFAULT_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ?? "snailmail-app.firebasestorage.app";

export function getAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const credentials = JSON.parse(json) as admin.ServiceAccount;
    return admin.initializeApp({
      credential: admin.credential.cert(credentials),
      storageBucket: DEFAULT_STORAGE_BUCKET,
    });
  }

  if (
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    process.env.K_SERVICE?.trim()
  ) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: DEFAULT_STORAGE_BUCKET,
    });
  }

  throw new Error(
    "Firebase Admin has no credentials. The web app config (apiKey / appId from Firebase \"Add app\" » Web) is only for clients. " +
      "For this server you need a service account private key: Firebase Console → Project settings → Service accounts → " +
      'Generate new private key, then either paste the JSON into env FIREBASE_SERVICE_ACCOUNT_JSON (single line), or save the file ' +
      "and set GOOGLE_APPLICATION_CREDENTIALS to its absolute path in `.env.local`.",
  );
}

export function getAdminDb(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

export function getAdminBucket() {
  return getAdminApp().storage().bucket(DEFAULT_STORAGE_BUCKET);
}
