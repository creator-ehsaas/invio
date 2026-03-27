"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Crown, X, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";

export function UpgradeBanner() {
  const [show, setShow] = useState(false);
  const [invoicesUsed, setInvoicesUsed] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    // Check if banner was dismissed today
    const lastDismissed = localStorage.getItem("upgrade-banner-dismissed");
    if (lastDismissed) {
      const hoursSince = (Date.now() - parseInt(lastDismissed)) / (1000 * 60 * 60);
      if (hoursSince < 12) {
        setDismissed(true);
        return;
      }
    }

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("users")
        .select("subscription_plan, invoices_this_month")
        .eq("id", user.id)
        .single();

      if (data) {
        const isFree = !data.subscription_plan || data.subscription_plan === "free";
        if (isFree) {
          setInvoicesUsed(data.invoices_this_month || 0);
          setShow(true);
        }
      }
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("upgrade-banner-dismissed", Date.now().toString());
  };

  if (!show || dismissed) return null;

  const remaining = 50 - invoicesUsed;
  const urgency = remaining <= 10 ? "high" : remaining <= 25 ? "medium" : "low";

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl mb-6
        ${urgency === "high"
          ? "bg-gradient-to-r from-red-500 via-orange-500 to-amber-500"
          : urgency === "medium"
          ? "bg-gradient-to-r from-amber-500 via-yellow-500 to-orange-400"
          : "bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600"
        }
      `}
    >
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRjMC0yLjIgMS44LTQgNC00czQgMS44IDQgNC0xLjggNC00IDQtNC0xLjgtNC00eiIvPjwvZz48L2c+PC9zdmc+')] animate-pulse" />
      </div>

      <div className="relative px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              {urgency === "high" ? (
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-pulse" />
              ) : (
                <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              )}
            </div>

            <div>
              <p className="text-white font-semibold text-sm sm:text-base">
                {urgency === "high"
                  ? `Only ${remaining} invoices left!`
                  : urgency === "medium"
                  ? `${remaining} free invoices remaining`
                  : "Upgrade to Invio Pro"
                }
              </p>
              <p className="text-white/80 text-xs sm:text-sm">
                {urgency === "high"
                  ? "Upgrade now to avoid interruption"
                  : "Unlimited invoices, all templates, AI insights"
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/subscription"
              className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-white text-slate-900 rounded-lg font-semibold text-sm hover:bg-white/90 transition-all hover:scale-105 shadow-lg"
            >
              <span className="hidden sm:inline">Upgrade</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Progress bar for urgency */}
        {urgency !== "low" && (
          <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${(invoicesUsed / 50) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
