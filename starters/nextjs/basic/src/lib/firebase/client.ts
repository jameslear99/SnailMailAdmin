"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Browser-side Firebase Auth for the admin portal. Uses the same Firebase
 * project as the main app and advertiser website.
 */

type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

function readFirebaseWebConfig(): FirebaseWebConfig {
  const fromPublic: FirebaseWebConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  // Prefer explicit NEXT_PUBLIC_* — App Hosting may inject FIREBASE_WEBAPP_CONFIG
  // from a different linked web app (e.g. another Firebase project in the same GCP org).
  if (fromPublic.apiKey && fromPublic.projectId && fromPublic.appId) {
    return fromPublic;
  }

  const injected = process.env.FIREBASE_WEBAPP_CONFIG?.trim();
  if (injected) {
    try {
      return JSON.parse(injected) as FirebaseWebConfig;
    } catch {
      // Fall through when JSON is malformed.
    }
  }

  return fromPublic;
}

const firebaseConfig = readFirebaseWebConfig();

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let _app: FirebaseApp | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Add NEXT_PUBLIC_FIREBASE_* values to .env.local.",
    );
  }
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return _app;
}

export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
