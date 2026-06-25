import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isFlagOn, flagVariant, type FeatureFlag, type FlagContext } from "@/lib/flags";

// Server-side flag evaluation for route handlers and Server Components.
// Degrades to "off" if the feature_flags table is missing or the query fails.
async function loadContext(): Promise<{ flags: Map<string, FeatureFlag>; ctx: FlagContext }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let plan: string | null = null;
  if (user) {
    const { data: ud } = await supabase
      .from("users").select("subscription_plan").eq("id", user.id).single();
    plan = ud?.subscription_plan ?? "free";
  }

  const flags = new Map<string, FeatureFlag>();
  const { data, error } = await supabase.from("feature_flags").select("*");
  if (!error && data) data.forEach((f) => flags.set(f.key, f as FeatureFlag));

  return { flags, ctx: { userId: user?.id ?? null, plan } };
}

export async function getServerFlag(key: string): Promise<boolean> {
  const { flags, ctx } = await loadContext();
  return isFlagOn(flags.get(key), ctx);
}

export async function getServerVariant(key: string): Promise<string | null> {
  const { flags, ctx } = await loadContext();
  return flagVariant(flags.get(key), ctx);
}
