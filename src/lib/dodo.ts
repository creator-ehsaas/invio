import DodoPayments from "dodopayments";

// Re-export plans for convenience (but prefer importing from @/lib/plans directly in client components)
export { PLANS, type PlanId } from "./plans";

// Lazy initialization - only create client when needed (server-side only)
let _dodo: DodoPayments | null = null;

export function getDodoClient(): DodoPayments {
  if (!_dodo) {
    if (!process.env.DODO_PAYMENTS_API_KEY) {
      throw new Error("DODO_PAYMENTS_API_KEY environment variable is not set");
    }
    _dodo = new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY,
      environment: "live_mode", // Using live API key
    });
  }
  return _dodo;
}
