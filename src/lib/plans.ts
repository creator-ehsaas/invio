// Subscription plans - safe to import on client side
export const PLANS = {
  FREE: {
    id: "free",
    name: "Free",
    price: 0,
    invoicesPerMonth: 20,
    aiTier: "standard" as const,
    features: [
      "20 invoices/month",
      "Standard AI (voice + receipt scan)",
      "Basic PDF templates",
      "WhatsApp sharing",
      "Estimates & expense tracking",
    ],
  },
  PRO_MONTHLY: {
    id: "pro_monthly",
    productId: "pdt_0NbOBhFMsWjIINgcQmle0",
    name: "Pro Monthly",
    price: 799,
    invoicesPerMonth: -1, // Unlimited
    aiTier: "enhanced" as const,
    features: [
      "Unlimited invoices & estimates",
      "Enhanced AI — smarter extraction & insights",
      "AI-powered P&L analysis",
      "All PDF templates",
      "Inventory management",
      "Full accounting & GST reports (GSTR-1/3B)",
      "Priority support",
    ],
  },
  PRO_YEARLY: {
    id: "pro_yearly",
    productId: "pdt_0NbOBjP6wUXk0a0K0pLBo",
    name: "Pro Yearly",
    price: 7999,
    invoicesPerMonth: -1, // Unlimited
    aiTier: "enhanced" as const,
    features: [
      "Everything in Pro Monthly",
      "2 months free (Save ₹1,589)",
      "Early access to new AI features",
      "Dedicated account manager",
    ],
  },
  // ── Future premium tier: Claude-powered AI. Shown as "Coming Soon" until
  // the Anthropic integration ships. Set productId + comingSoon:false to launch.
  BUSINESS_MONTHLY: {
    id: "business_monthly",
    productId: "pdt_0NhnLJRNg6GngVJrYR4oD", // live; flip comingSoon:false to launch
    name: "Business",
    price: 1999,
    invoicesPerMonth: -1, // Unlimited
    aiTier: "premium" as const,
    comingSoon: true,
    features: [
      "Everything in Pro",
      "AI Accountant — Claude-powered reconciliation & advice",
      "Document intelligence — bulk extract from any PDF/scan",
      "Smart tender & bid analysis",
      "Multi-user / team access",
      "Dedicated onboarding & support",
    ],
  },
  BUSINESS_YEARLY: {
    id: "business_yearly",
    productId: "pdt_0NhnLJasDHgI7ggVYhky7", // live; flip comingSoon:false to launch
    name: "Business Yearly",
    price: 19999,
    invoicesPerMonth: -1, // Unlimited
    aiTier: "premium" as const,
    comingSoon: true,
    features: [
      "Everything in Business Monthly",
      "2 months free (Save ₹3,989)",
      "Early access to every new Claude feature",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;
