"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { X, Crown, AlertTriangle, CheckCircle, Sparkles } from "lucide-react";

interface Notification {
  id: string;
  type: "success" | "warning" | "upgrade";
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
}

export function BillingNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const searchParams = useSearchParams();

  useEffect(() => {
    checkNotifications();
  }, [searchParams]);

  const checkNotifications = async () => {
    const newNotifications: Notification[] = [];

    // Check for subscription success from URL
    if (searchParams.get("subscription") === "success") {
      newNotifications.push({
        id: "sub-success",
        type: "success",
        title: "Welcome to Pro!",
        message: "Your subscription is now active. Enjoy unlimited invoices and all premium features.",
      });
    }

    // Check user's subscription status and usage
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: userData } = await supabase
        .from("users")
        .select("subscription_plan, invoices_this_month")
        .eq("id", user.id)
        .single();

      if (userData) {
        const isFree = !userData.subscription_plan || userData.subscription_plan === "free";
        const invoicesUsed = userData.invoices_this_month || 0;

        // Warning: approaching limit (free users at 40+ invoices)
        if (isFree && invoicesUsed >= 40 && invoicesUsed < 50) {
          newNotifications.push({
            id: "limit-warning",
            type: "warning",
            title: "Approaching Invoice Limit",
            message: `You've used ${invoicesUsed}/50 free invoices this month. Upgrade for unlimited access.`,
            action: {
              label: "Upgrade to Pro",
              href: "/subscription",
            },
          });
        }

        // Upgrade prompt for free users (show occasionally)
        if (isFree && invoicesUsed >= 10 && invoicesUsed < 40) {
          const lastPrompt = localStorage.getItem("upgrade-prompt-dismissed");
          const hoursSincePrompt = lastPrompt
            ? (Date.now() - parseInt(lastPrompt)) / (1000 * 60 * 60)
            : 999;

          if (hoursSincePrompt > 24) {
            newNotifications.push({
              id: "upgrade-prompt",
              type: "upgrade",
              title: "Unlock More with Pro",
              message: "Get unlimited invoices, all templates, and AI-powered insights.",
              action: {
                label: "View Plans",
                href: "/subscription",
              },
            });
          }
        }
      }
    }

    setNotifications(newNotifications);
  };

  const dismissNotification = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));

    // Remember upgrade prompt dismissal
    if (id === "upgrade-prompt") {
      localStorage.setItem("upgrade-prompt-dismissed", Date.now().toString());
    }

    // Clear URL params for success notification
    if (id === "sub-success") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  };

  const visibleNotifications = notifications.filter((n) => !dismissed.has(n.id));

  if (visibleNotifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className={`
            relative rounded-xl p-4 shadow-lg backdrop-blur-xl border
            animate-in slide-in-from-right-5 fade-in duration-300
            ${notification.type === "success"
              ? "bg-emerald-50/90 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800"
              : notification.type === "warning"
              ? "bg-amber-50/90 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800"
              : "bg-gradient-to-r from-violet-50/90 to-purple-50/90 dark:from-violet-950/90 dark:to-purple-950/90 border-violet-200 dark:border-violet-800"
            }
          `}
        >
          <button
            onClick={() => dismissNotification(notification.id)}
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div
              className={`
                flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                ${notification.type === "success"
                  ? "bg-emerald-500"
                  : notification.type === "warning"
                  ? "bg-amber-500"
                  : "bg-gradient-to-br from-violet-500 to-purple-600"
                }
              `}
            >
              {notification.type === "success" ? (
                <CheckCircle className="w-5 h-5 text-white" />
              ) : notification.type === "warning" ? (
                <AlertTriangle className="w-5 h-5 text-white" />
              ) : (
                <Crown className="w-5 h-5 text-white" />
              )}
            </div>

            <div className="flex-1">
              <h4
                className={`font-semibold text-sm ${
                  notification.type === "success"
                    ? "text-emerald-800 dark:text-emerald-200"
                    : notification.type === "warning"
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-violet-800 dark:text-violet-200"
                }`}
              >
                {notification.title}
              </h4>
              <p
                className={`text-sm mt-0.5 ${
                  notification.type === "success"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : notification.type === "warning"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-violet-700 dark:text-violet-300"
                }`}
              >
                {notification.message}
              </p>

              {notification.action && (
                <a
                  href={notification.action.href}
                  className={`
                    inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-sm font-medium
                    transition-all hover:scale-105
                    ${notification.type === "success"
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : notification.type === "warning"
                      ? "bg-amber-600 text-white hover:bg-amber-700"
                      : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700"
                    }
                  `}
                >
                  <Sparkles className="w-4 h-4" />
                  {notification.action.label}
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
