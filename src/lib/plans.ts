// Subscription plans - safe to import on client side
export const PLANS = {
  FREE: {
    id: "free",
    name: "Free",
    price: 0,
    invoicesPerMonth: 50,
    aiTier: "standard" as const,
    features: [
      "50 invoices/month",
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
    price: 499,
    invoicesPerMonth: -1, // Unlimited
    aiTier: "enhanced" as const,
    features: [
      "Unlimited invoices & estimates",
      "Enhanced AI — smarter extraction & insights",
      "AI-powered P&L analysis",
      "All 4 PDF templates",
      "Inventory management",
      "Priority support",
    ],
  },
  PRO_YEARLY: {
    id: "pro_yearly",
    productId: "pdt_0NbOBjP6wUXk0a0K0pLBo",
    name: "Pro Yearly",
    price: 4999,
    invoicesPerMonth: -1, // Unlimited
    aiTier: "enhanced" as const,
    features: [
      "Everything in Pro Monthly",
      "2 months free (Save ₹999)",
      "Early access to new AI features",
      "Dedicated account manager",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;
