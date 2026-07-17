/** Parsed snail appearance from Firestore `snail.look` (Flutter [SnailLook]). */

export type ParsedSnailLook = {
  antennaAssetId: string;
  bodyAssetId: string;
  shellAssetId: string;
  faceAssetId: string;
  accessoryAssetId?: string;
  antennaColor: string;
  bodyColor: string;
  shellColor: string;
};

export function flutterColorToHex(argb: number): string {
  const unsigned = argb >>> 0;
  const r = (unsigned >> 16) & 0xff;
  const g = (unsigned >> 8) & 0xff;
  const b = unsigned & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Flutter `Color.value` (ARGB) from `#rrggbb`. */
export function hexToFlutterColor(hex: string): number {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  // Bitwise ops are signed 32-bit in JS; Flutter stores unsigned ARGB.
  return ((255 << 24) | (r << 16) | (g << 8) | b) >>> 0;
}

export function parseSnailLookFromSnail(
  snail: Record<string, unknown> | null | undefined,
): ParsedSnailLook | null {
  if (!snail) return null;
  return parseSnailLookFromProfile({ snail });
}

export function parseSnailLookFromProfile(
  profile: Record<string, unknown> | null | undefined,
): ParsedSnailLook | null {
  if (!profile) return null;
  const snail = profile.snail;
  if (!snail || typeof snail !== "object" || Array.isArray(snail)) return null;

  const snailMap = snail as Record<string, unknown>;
  const lookRaw = snailMap.look;
  if (!lookRaw || typeof lookRaw !== "object" || Array.isArray(lookRaw)) return null;

  const look = lookRaw as Record<string, unknown>;
  const antennaAssetId = typeof look.antennaAssetId === "string" ? look.antennaAssetId.trim() : "";
  const bodyAssetId = typeof look.bodyAssetId === "string" ? look.bodyAssetId.trim() : "";
  const shellAssetId = typeof look.shellAssetId === "string" ? look.shellAssetId.trim() : "";
  const faceAssetId = typeof look.faceAssetId === "string" ? look.faceAssetId.trim() : "";

  if (!antennaAssetId || !bodyAssetId || !shellAssetId || !faceAssetId) return null;

  const accessoryRaw = look.accessoryAssetId;
  const accessoryAssetId =
    typeof accessoryRaw === "string" && accessoryRaw.trim() ? accessoryRaw.trim() : undefined;

  return {
    antennaAssetId,
    bodyAssetId,
    shellAssetId,
    faceAssetId,
    accessoryAssetId,
    antennaColor: flutterColorToHex(Number(look.antennaColor) || 0xff6e8b5e),
    bodyColor: flutterColorToHex(Number(look.bodyColor) || 0xff6e8b5e),
    shellColor: flutterColorToHex(Number(look.shellColor) || 0xff8b9e7a),
  };
}

export function snailLookFingerprint(look: ParsedSnailLook): string {
  return [
    look.antennaAssetId,
    look.bodyAssetId,
    look.shellAssetId,
    look.faceAssetId,
    look.accessoryAssetId ?? "",
    look.antennaColor,
    look.bodyColor,
    look.shellColor,
  ].join("|");
}
