import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/plans";

const FREE_LIMIT = PLANS.FREE.invoicesPerMonth;

export type SubscriptionPlan = "free" | "pro_monthly" | "pro_yearly" | "business_monthly" | "business_yearly";

export interface SubscriptionStatus {
  canCreateInvoice: boolean;
  plan: SubscriptionPlan;
  invoicesUsed: number;
  invoicesLimit: number;
  isProUser: boolean;
}

export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      canCreateInvoice: false,
      plan: "free",
      invoicesUsed: 0,
      invoicesLimit: FREE_LIMIT,
      isProUser: false,
    };
  }

  const { data: userData } = await supabase
    .from("users")
    .select("subscription_plan, invoices_this_month, invoices_reset_date")
    .eq("id", user.id)
    .single();

  if (!userData) {
    return {
      canCreateInvoice: true,
      plan: "free",
      invoicesUsed: 0,
      invoicesLimit: FREE_LIMIT,
      isProUser: false,
    };
  }

  const plan = userData.subscription_plan as SubscriptionPlan;
  const isProUser = plan === "pro_monthly" || plan === "pro_yearly" || plan === "business_monthly" || plan === "business_yearly";
  let invoicesUsed = userData.invoices_this_month || 0;

  // Reset counter if new month
  const resetDate = userData.invoices_reset_date
    ? new Date(userData.invoices_reset_date)
    : null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  if (!resetDate || resetDate < monthStart) {
    // Reset the counter
    await supabase
      .from("users")
      .update({
        invoices_this_month: 0,
        invoices_reset_date: new Date().toISOString(),
      })
      .eq("id", user.id);
    invoicesUsed = 0;
  }

  return {
    canCreateInvoice: isProUser || invoicesUsed < FREE_LIMIT,
    plan,
    invoicesUsed,
    invoicesLimit: isProUser ? -1 : FREE_LIMIT,
    isProUser,
  };
}

export async function incrementInvoiceCount(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  // Increment the invoice count
  await supabase.rpc("increment_invoice_count", { p_user_id: user.id });
}
