import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

async function authHeaders(): Promise<HeadersInit> {
  if (!isFirebaseConfigured()) return {};
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** Authenticated fetch for `/api/*` — attaches the Firebase ID token. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const auth = await authHeaders();
  for (const [key, value] of Object.entries(auth)) {
    if (value) headers.set(key, String(value));
  }
  return fetch(input, { ...init, headers });
}

export async function apiJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j.error) message = j.error;
    } catch {
      /* use raw text */
    }
    throw new Error(message || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
