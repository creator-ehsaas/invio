import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/gem-audit";

/**
 * Shared auth/ownership plumbing for gem-participation API routes.
 */

export async function getAuthContext(): Promise<
  { userId: string; businessId: string } | { error: string; status: number }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required", status: 401 };

  const { data: userData } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();
  if (!userData?.business_id) return { error: "No business profile found", status: 400 };

  return { userId: user.id, businessId: userData.business_id };
}

export async function getOwnedSession(businessId: string, sessionId: string) {
  const supabase = serviceClient();
  const { data: session } = await supabase
    .from("gem_participation_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("business_id", businessId)
    .maybeSingle();
  return session;
}
