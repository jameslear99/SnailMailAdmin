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
  const r = (argb >> 16) & 0xff;
  const g = (argb >> 8) & 0xff;
  const b = argb & 0xff;
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
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
