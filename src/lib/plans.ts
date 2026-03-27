// Subscription plans - safe to import on client side
export const PLANS = {
  FREE: {
    id: "free",
    name: "Free",
    price: 0,
    invoicesPerMonth: 50,
    features: [
      "50 invoices/month",
      "Voice input in 3 languages",
      "Basic PDF templates",
      "WhatsApp sharing",
    ],
  },
  PRO_MONTHLY: {
    id: "pro_monthly",
    productId: "pdt_0NbOBhFMsWjIINgcQmle0",
    name: "Pro Monthly",
    price: 499,
    invoicesPerMonth: -1, // Unlimited
    features: [
      "Unlimited invoices",
      "All 4 PDF templates",
      "AI learning from corrections",
      "Business insights & analytics",
      "Priority support",
      "Inventory management",
    ],
  },
  PRO_YEARLY: {
    id: "pro_yearly",
    productId: "pdt_0NbOBjP6wUXk0a0K0pLBo",
    name: "Pro Yearly",
    price: 4999,
    invoicesPerMonth: -1, // Unlimited
    features: [
      "Everything in Pro Monthly",
      "2 months free (Save Rs 999)",
      "Early access to new features",
      "Dedicated account manager",
    ],
  },
} as const;

export type PlanId = keyof typeof PLANS;
