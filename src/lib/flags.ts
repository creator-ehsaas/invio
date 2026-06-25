// Self-hosted feature flags + A/B experiments, evaluated against the
// feature_flags table. Safe to import on client and server — the pure
// evaluator has no Supabase dependency.

export interface FeatureFlag {
  key: string;
  description?: string | null;
  enabled: boolean;
  rollout_pct: number; // 0–100
  plan_target?: string[] | null; // null = all plans
  variants?: string[] | null; // null = boolean flag; else A/B buckets
}

export interface FlagContext {
  userId: string | null; // stable id for bucketing
  plan?: string | null; // current subscription plan
}

// Deterministic 0–99 bucket from a seed string (FNV-1a hash). Same user + flag
// always lands in the same bucket, so rollouts and A/B assignments are stable.
export function stableBucket(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

/** Is this boolean flag on for the given context? */
export function isFlagOn(flag: FeatureFlag | undefined, ctx: FlagContext): boolean {
  if (!flag || !flag.enabled) return false;
  if (flag.plan_target && flag.plan_target.length > 0) {
    if (!ctx.plan || !flag.plan_target.includes(ctx.plan)) return false;
  }
  const pct = Math.max(0, Math.min(100, flag.rollout_pct ?? 100));
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  const seed = `${flag.key}:${ctx.userId ?? "anon"}`;
  return stableBucket(seed) < pct;
}

/** Which A/B variant does this context get? Returns null if flag off / not a variant flag. */
export function flagVariant(flag: FeatureFlag | undefined, ctx: FlagContext): string | null {
  if (!isFlagOn(flag, ctx) || !flag?.variants || flag.variants.length === 0) return null;
  const seed = `${flag.key}:variant:${ctx.userId ?? "anon"}`;
  const idx = stableBucket(seed) % flag.variants.length;
  return flag.variants[idx];
}
