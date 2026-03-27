"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { PLANS } from "@/lib/plans";
import {
  CreditCard,
  Check,
  Zap,
  Crown,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface SubscriptionData {
  id: string;
  plan_id: string;
  status: string;
  current_period_end: string;
}

interface UserData {
  subscription_status: string;
  subscription_plan: string;
  invoices_this_month: number;
}

export default function SubscriptionPage() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return;

    // Get user data
    const { data: userRecord } = await supabase
      .from("users")
      .select("subscription_status, subscription_plan, invoices_this_month")
      .eq("id", user.id)
      .single();

    if (userRecord) {
      setUserData(userRecord);
    }

    // Get active subscription (use maybeSingle since user may not have one)
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub) {
      setSubscription(sub);
    }

    setLoading(false);
  };

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json();

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Upgrade error:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setUpgrading(null);
    }
  };

  const currentPlan = userData?.subscription_plan || "free";
  const isPro = currentPlan === "pro_monthly" || currentPlan === "pro_yearly";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-2">Subscription</h1>
      <p className="text-muted-foreground mb-8">
        Manage your subscription and billing
      </p>

      {/* Current Plan Card */}
      <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6 mb-8">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {isPro ? (
                <Crown className="w-6 h-6 text-amber-500" />
              ) : (
                <Zap className="w-6 h-6 text-primary" />
              )}
              <h2 className="text-xl font-semibold text-foreground">
                {isPro ? "Pro Plan" : "Free Plan"}
              </h2>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  userData?.subscription_status === "active"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                {userData?.subscription_status || "Active"}
              </span>
            </div>
            <p className="text-muted-foreground">
              {isPro
                ? "Unlimited invoices, all features unlocked"
                : `${50 - (userData?.invoices_this_month || 0)} invoices remaining this month`}
            </p>
          </div>

          {subscription?.current_period_end && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Next billing</p>
              <p className="font-medium text-foreground">
                {new Date(subscription.current_period_end).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
          )}
        </div>

        {/* Usage bar for free plan */}
        {!isPro && (
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Monthly usage</span>
              <span className="font-medium">
                {userData?.invoices_this_month || 0} / 50 invoices
              </span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${Math.min(((userData?.invoices_this_month || 0) / 50) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Upgrade Options */}
      {!isPro && (
        <>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Upgrade to Pro
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            {/* Pro Monthly */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 hover:border-primary/50 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-semibold text-foreground">{PLANS.PRO_MONTHLY.name}</h4>
                  <p className="text-sm text-muted-foreground">Billed monthly</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">₹{PLANS.PRO_MONTHLY.price}</p>
                  <p className="text-sm text-muted-foreground">/month</p>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {PLANS.PRO_MONTHLY.features.slice(0, 4).map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade("pro_monthly")}
                disabled={upgrading === "pro_monthly"}
                className="w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {upgrading === "pro_monthly" ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Upgrade Now
                  </>
                )}
              </button>
            </div>

            {/* Pro Yearly */}
            <div className="bg-gradient-to-br from-primary/5 to-blue-500/5 rounded-2xl border-2 border-primary p-6 relative">
              <div className="absolute -top-3 left-4 px-3 py-1 bg-primary text-white text-xs font-semibold rounded-full">
                Save ₹999
              </div>

              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-semibold text-foreground">{PLANS.PRO_YEARLY.name}</h4>
                  <p className="text-sm text-muted-foreground">Billed yearly</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-foreground">₹{PLANS.PRO_YEARLY.price}</p>
                  <p className="text-sm text-muted-foreground">/year</p>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {PLANS.PRO_YEARLY.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleUpgrade("pro_yearly")}
                disabled={upgrading === "pro_yearly"}
                className="w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {upgrading === "pro_yearly" ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Get Yearly Plan
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Pro Plan Management */}
      {isPro && (
        <div className="bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl rounded-2xl border border-slate-200/50 dark:border-slate-800/50 p-6">
          <h3 className="font-semibold text-foreground mb-4">Manage Subscription</h3>

          <div className="flex flex-wrap gap-4">
            <button className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-slate-200 dark:border-slate-700 rounded-lg transition-all flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Billing Portal
            </button>
            <button className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 dark:border-red-900/50 rounded-lg transition-all">
              Cancel Subscription
            </button>
          </div>

          <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Need help?
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Contact support at support@invio.app for billing questions or plan changes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
