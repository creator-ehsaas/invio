import { createClient } from "@/lib/supabase/server";

export interface SubscriptionStatus {
  canCreateInvoice: boolean;
  plan: "free" | "pro_monthly" | "pro_yearly";
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
      invoicesLimit: 50,
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
      invoicesLimit: 50,
      isProUser: false,
    };
  }

  const plan = userData.subscription_plan as "free" | "pro_monthly" | "pro_yearly";
  const isProUser = plan === "pro_monthly" || plan === "pro_yearly";
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
    canCreateInvoice: isProUser || invoicesUsed < 50,
    plan,
    invoicesUsed,
    invoicesLimit: isProUser ? -1 : 50,
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
