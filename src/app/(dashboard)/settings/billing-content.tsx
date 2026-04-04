"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ExternalLink, Crown, Zap } from "lucide-react";

interface SubscriptionData {
  plan: string;
  invoicesUsed: number;
  invoicesLimit: number;
  customersCount: number;
  itemsCount: number;
}

export function BillingContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch user subscription info
    const { data: userData } = await supabase
      .from("users")
      .select("subscription_plan, invoices_this_month, business_id")
      .eq("id", user.id)
      .single();

    if (!userData) return;

    const plan = userData.subscription_plan || "free";
    const isPro = plan === "pro_monthly" || plan === "pro_yearly";

    // Count customers
    const { count: customersCount } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true })
      .eq("business_id", userData.business_id);

    // Count inventory items
    const { count: itemsCount } = await supabase
      .from("inventory_items")
      .select("*", { count: "exact", head: true })
      .eq("business_id", userData.business_id);

    setData({
      plan,
      invoicesUsed: userData.invoices_this_month || 0,
      invoicesLimit: isPro ? -1 : 50, // -1 means unlimited
      customersCount: customersCount || 0,
      itemsCount: itemsCount || 0,
    });
    setLoading(false);
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    router.push("/subscription");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Unable to load billing information.
      </div>
    );
  }

  const isPro = data.plan === "pro_monthly" || data.plan === "pro_yearly";
  const planLabel = isPro ? (data.plan === "pro_yearly" ? "Pro (Yearly)" : "Pro (Monthly)") : "Free";
  const invoicePercent = data.invoicesLimit > 0
    ? Math.min((data.invoicesUsed / data.invoicesLimit) * 100, 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <div className={`p-6 rounded-2xl border ${
        isPro
          ? "bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/20"
          : "bg-gradient-to-br from-primary/10 to-blue-500/10 border-primary/20"
      }`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {isPro ? (
              <div className="p-2 bg-amber-500/20 rounded-xl">
                <Crown className="w-5 h-5 text-amber-600" />
              </div>
            ) : (
              <div className="p-2 bg-primary/20 rounded-xl">
                <Zap className="w-5 h-5 text-primary" />
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Current Plan
              </p>
              <p className="text-2xl font-bold text-foreground">{planLabel}</p>
            </div>
          </div>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
            isPro
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
              : "bg-primary/20 text-primary"
          }`}>
            Active
          </span>
        </div>

        {isPro ? (
          <p className="text-sm text-muted-foreground mb-4">
            You have unlimited access to all features. Thank you for being a Pro member!
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Upgrade to Pro for unlimited invoices, priority support, and advanced features.
            </p>
            <button
              onClick={handleUpgrade}
              disabled={upgrading}
              className="w-full py-3 bg-gradient-to-br from-primary to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {upgrading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Crown className="w-4 h-4" />
                  Upgrade to Pro
                </>
              )}
            </button>
          </>
        )}
      </div>

      {/* Usage Stats */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Usage This Month</h3>

        <div className="space-y-4">
          {/* Invoices */}
          <div className="p-4 bg-muted/50 rounded-xl">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Invoices Created</span>
              <span className="text-foreground font-medium">
                {data.invoicesUsed} {data.invoicesLimit > 0 ? `/ ${data.invoicesLimit}` : "(Unlimited)"}
              </span>
            </div>
            {data.invoicesLimit > 0 && (
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    invoicePercent >= 80 ? "bg-red-500" : invoicePercent >= 60 ? "bg-amber-500" : "bg-primary"
                  }`}
                  style={{ width: `${invoicePercent}%` }}
                />
              </div>
            )}
            {!isPro && invoicePercent >= 80 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                You&apos;re running low on invoices. Upgrade for unlimited.
              </p>
            )}
          </div>

          {/* Customers */}
          <div className="p-4 bg-muted/50 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Customers</span>
              <span className="text-foreground font-medium">{data.customersCount}</span>
            </div>
          </div>

          {/* Inventory Items */}
          <div className="p-4 bg-muted/50 rounded-xl">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Inventory Items</span>
              <span className="text-foreground font-medium">{data.itemsCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Manage Subscription Link */}
      {isPro && (
        <div className="pt-4 border-t border-slate-200/50 dark:border-slate-800/50">
          <button
            onClick={() => router.push("/subscription")}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            Manage Subscription
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
