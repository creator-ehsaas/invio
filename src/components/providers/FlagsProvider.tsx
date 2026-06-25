"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { isFlagOn, flagVariant, type FeatureFlag, type FlagContext } from "@/lib/flags";

interface FlagsState {
  flags: Map<string, FeatureFlag>;
  ctx: FlagContext;
  loaded: boolean;
}

const FlagsCtx = createContext<FlagsState>({
  flags: new Map(),
  ctx: { userId: null, plan: null },
  loaded: false,
});

export function FlagsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FlagsState>({
    flags: new Map(),
    ctx: { userId: null, plan: null },
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        let plan: string | null = null;
        if (user) {
          const { data: ud } = await supabase
            .from("users").select("subscription_plan").eq("id", user.id).single();
          plan = ud?.subscription_plan ?? "free";
        }
        const { data, error } = await supabase.from("feature_flags").select("*");
        const flags = new Map<string, FeatureFlag>();
        if (!error && data) data.forEach((f) => flags.set(f.key, f as FeatureFlag));
        if (!cancelled) setState({ flags, ctx: { userId: user?.id ?? null, plan }, loaded: true });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loaded: true }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <FlagsCtx.Provider value={state}>{children}</FlagsCtx.Provider>;
}

/** Boolean feature flag. Returns false until flags load (fail-safe off). */
export function useFlag(key: string): boolean {
  const { flags, ctx } = useContext(FlagsCtx);
  return isFlagOn(flags.get(key), ctx);
}

/** A/B variant for an experiment flag, or null. */
export function useVariant(key: string): string | null {
  const { flags, ctx } = useContext(FlagsCtx);
  return flagVariant(flags.get(key), ctx);
}

/** Whether flags have finished loading (to avoid UI flicker if needed). */
export function useFlagsLoaded(): boolean {
  return useContext(FlagsCtx).loaded;
}
