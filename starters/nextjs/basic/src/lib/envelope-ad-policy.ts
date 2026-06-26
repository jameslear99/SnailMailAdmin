/**
 * How many ad pages to include in a physical envelope for a given number of postcards.
 * Stored in Firestore under `adminSettings/envelopeAdPolicy`.
 */

export type EnvelopeAdRounding = "floor" | "ceil" | "round";

/** When post count falls in [minPosts, maxPosts] (inclusive), use adPages. First matching tier wins (list order). */
export type EnvelopeAdTier = {
  minPosts: number;
  maxPosts: number;
  adPages: number;
};

export type EnvelopeAdPolicy = {
  /** Multiplier: adPages ≈ postCount × adsPerPostRatio (after rounding), unless a tier matches. */
  adsPerPostRatio: number;
  rounding: EnvelopeAdRounding;
  /** Applied after ratio/tier (unless postCount is 0 → always 0). */
  minAdPages: number;
  maxAdPages: number;
  tiers: EnvelopeAdTier[];
};

export const DEFAULT_ENVELOPE_AD_POLICY: EnvelopeAdPolicy = {
  adsPerPostRatio: 1,
  rounding: "round",
  minAdPages: 0,
  maxAdPages: 50,
  tiers: [],
};

function applyRounding(value: number, mode: EnvelopeAdRounding): number {
  switch (mode) {
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    default:
      return Math.round(value);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Ad pages for one envelope given how many postcards are inside. */
export function adPagesForPostCount(postCount: number, policy: EnvelopeAdPolicy): number {
  if (postCount <= 0) return 0;
  for (const t of policy.tiers) {
    if (postCount >= t.minPosts && postCount <= t.maxPosts) {
      return clamp(t.adPages, policy.minAdPages, policy.maxAdPages);
    }
  }
  const raw = postCount * policy.adsPerPostRatio;
  const n = applyRounding(raw, policy.rounding);
  return clamp(n, policy.minAdPages, policy.maxAdPages);
}

export function parseEnvelopeAdPolicy(raw: Record<string, unknown> | null | undefined): EnvelopeAdPolicy {
  if (!raw) return { ...DEFAULT_ENVELOPE_AD_POLICY };
  const ratio = Number(raw.adsPerPostRatio);
  const minA = Number(raw.minAdPages);
  const maxA = Number(raw.maxAdPages);
  const r = raw.rounding;
  const rounding: EnvelopeAdRounding =
    r === "floor" || r === "ceil" || r === "round" ? r : DEFAULT_ENVELOPE_AD_POLICY.rounding;
  const tiersIn = Array.isArray(raw.tiers) ? raw.tiers : [];
  const tiers: EnvelopeAdTier[] = [];
  for (const row of tiersIn) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const minP = Number(o.minPosts);
    const maxP = Number(o.maxPosts);
    const ads = Number(o.adPages);
    if (!Number.isFinite(minP) || !Number.isFinite(maxP) || !Number.isFinite(ads)) continue;
    tiers.push({
      minPosts: Math.max(0, Math.floor(minP)),
      maxPosts: Math.max(0, Math.floor(maxP)),
      adPages: Math.max(0, Math.floor(ads)),
    });
  }
  return {
    adsPerPostRatio: Number.isFinite(ratio) && ratio >= 0 ? ratio : DEFAULT_ENVELOPE_AD_POLICY.adsPerPostRatio,
    rounding,
    minAdPages: Number.isFinite(minA) && minA >= 0 ? Math.floor(minA) : DEFAULT_ENVELOPE_AD_POLICY.minAdPages,
    maxAdPages:
      Number.isFinite(maxA) && maxA >= 0 ? Math.floor(maxA) : DEFAULT_ENVELOPE_AD_POLICY.maxAdPages,
    tiers,
  };
}
