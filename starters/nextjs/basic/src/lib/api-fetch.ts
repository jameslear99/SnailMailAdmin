/** Plain fetch for local `/api/*` calls. Auth is intentionally disabled for now. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init);
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
