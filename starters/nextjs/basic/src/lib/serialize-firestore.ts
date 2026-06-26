import { Timestamp, type DocumentData } from "firebase-admin/firestore";

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    return serializeRecord(value as Record<string, unknown>);
  }

  return value;
}

function serializeRecord(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = serializeValue(v);
  }
  return out;
}

/** Convert Firestore document data to JSON-safe structures (timestamps → ISO strings). */
export function serializeDoc(data: DocumentData | undefined): Record<string, unknown> | null {
  if (!data) return null;
  return serializeRecord(data as unknown as Record<string, unknown>);
}
