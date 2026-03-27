/**
 * Check Dodo product settings
 */

import DodoPayments from "dodopayments";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const dodo = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    environment: "live_mode",
  });

  const products = [
    "pdt_0NbOBhFMsWjIINgcQmle0", // Pro Monthly
    "pdt_0NbOBjP6wUXk0a0K0pLBo", // Pro Yearly
  ];

  for (const id of products) {
    const product = await dodo.products.retrieve(id);
    console.log(`\n${product.name}:`);
    console.log(`  tax_inclusive: ${(product as any).tax_inclusive}`);
    console.log(`  tax_category: ${product.tax_category}`);
    console.log(`  price: ${JSON.stringify(product.price)}`);
  }
}

main();
