/**
 * Script to update Dodo Payments products to tax-inclusive pricing
 * Run with: npx tsx scripts/update-dodo-products.ts
 */

import DodoPayments from "dodopayments";
import { config } from "dotenv";

// Load .env.local
config({ path: ".env.local" });

async function main() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    console.error("DODO_PAYMENTS_API_KEY not found in .env.local");
    process.exit(1);
  }

  const dodo = new DodoPayments({
    bearerToken: apiKey,
    environment: "live_mode",
  });

  const products = [
    {
      id: "pdt_0NbOBhFMsWjIINgcQmle0",
      name: "Pro Monthly",
      price: {
        type: "recurring_price" as const,
        price: 49900, // ₹499 in paise
        currency: "INR" as const,
        discount: 0,
        purchasing_power_parity: false,
        payment_frequency_count: 1,
        payment_frequency_interval: "Month" as const,
        subscription_period_count: 1,
        subscription_period_interval: "Month" as const,
        trial_period_days: 0,
        tax_inclusive: true, // GST included in ₹499
      }
    },
    {
      id: "pdt_0NbOBjP6wUXk0a0K0pLBo",
      name: "Pro Yearly",
      price: {
        type: "recurring_price" as const,
        price: 499900, // ₹4999 in paise
        currency: "INR" as const,
        discount: 0,
        purchasing_power_parity: false,
        payment_frequency_count: 1,
        payment_frequency_interval: "Year" as const,
        subscription_period_count: 1,
        subscription_period_interval: "Year" as const,
        trial_period_days: 0,
        tax_inclusive: true, // GST included in ₹4999
      }
    },
  ];

  console.log("Updating products to tax-inclusive pricing...\n");

  for (const product of products) {
    try {
      await dodo.products.update(product.id, {
        price: product.price,
      });
      console.log(`✓ ${product.name} updated to tax-inclusive`);
    } catch (error: any) {
      console.error(`✗ ${product.name} failed:`, error.message);
    }
  }

  console.log("\nDone! Prices will now include GST (₹499 total, not ₹499 + GST)");
}

main();
