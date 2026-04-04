"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

interface AIUpgradeNudgeProps {
  feature?: string;
  compact?: boolean;
}

/**
 * Shown to free-plan users when they try to use Enhanced AI features.
 * Never mentions specific AI provider names — just "Enhanced AI".
 */
export function AIUpgradeNudge({ feature, compact = false }: AIUpgradeNudgeProps) {
  if (compact) {
    return (
      <Link
        href="/subscription"
        className="inline-flex items-center gap-1.5 text-xs text-purple-700 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-full px-3 py-1 hover:bg-purple-100 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        Upgrade for Enhanced AI
        <ArrowRight className="w-3 h-3" />
      </Link>
    );
  }

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800/50 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
          <Sparkles className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-foreground text-sm">
            Enhanced AI Available on Pro
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {feature
              ? `${feature} uses our most powerful AI for higher accuracy and smarter insights.`
              : "Upgrade to Pro for smarter AI that learns from your business patterns."}
            {" "}Standard AI is still working for you.
          </p>
        </div>
        <Link
          href="/subscription"
          className="shrink-0 text-xs px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Upgrade
        </Link>
      </div>
    </div>
  );
}
