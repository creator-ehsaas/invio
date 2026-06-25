/* eslint-disable */
// One-off script to align DodoPayments products with the new pricing.
//
//   node scripts/dodo-update.js            # uses DODO_PAYMENTS_API_KEY from env
//   node scripts/dodo-update.js <api_key>  # or pass the key as an argument
//
// What it does:
//   1. Retrieves the two existing Pro products (monthly + yearly)
//   2. Updates their price to ₹799 / ₹7,999 (unit inferred from existing data)
//   3. Creates two new Business products (₹1,999/mo, ₹19,999/yr) by cloning the
//      Pro product schema so currency/tax/interval fields match exactly
//   4. Prints all four product IDs so they can be pasted into src/lib/plans.ts
//
// Nothing is hard-coded about the price schema — it mirrors what already works.

const DodoPayments = require("dodopayments");

const PRO_MONTHLY_ID = "pdt_0NbOBhFMsWjIINgcQmle0";
const PRO_YEARLY_ID = "pdt_0NbOBjP6wUXk0a0K0pLBo";

// Target prices in RUPEES; the script converts to the unit the API actually uses.
const TARGET = {
  proMonthly: 799,
  proYearly: 7999,
  businessMonthly: 1999,
  businessYearly: 19999,
};

function getKey() {
  const key = process.argv[2] || process.env.DODO_PAYMENTS_API_KEY;
  if (!key) {
    console.error("✗ No API key. Pass it as an argument or set DODO_PAYMENTS_API_KEY.");
    process.exit(1);
  }
  return key;
}

// Infer whether the API stores amounts in paise (×100) or rupees, from a known ₹499 product.
function unitFromExisting(existingAmount, knownRupees) {
  if (existingAmount === knownRupees) return 1;           // rupees
  if (existingAmount === knownRupees * 100) return 100;   // paise
  // Fallback: if amount is large, assume smallest unit (paise)
  return existingAmount > 1000 ? 100 : 1;
}

async function main() {
  const env = process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode";
  const dodo = new (DodoPayments.default || DodoPayments)({
    bearerToken: getKey(),
    environment: env,
  });
  console.log(`→ Connected to DodoPayments (${env})\n`);

  // 1. Retrieve existing Pro products
  const proMonthly = await dodo.products.retrieve(PRO_MONTHLY_ID);
  const proYearly = await dodo.products.retrieve(PRO_YEARLY_ID);
  console.log("Current Pro Monthly price:", JSON.stringify(proMonthly.price));
  console.log("Current Pro Yearly  price:", JSON.stringify(proYearly.price), "\n");

  const unit = unitFromExisting(proMonthly.price?.price, 499);
  console.log(`→ Detected amount unit: ×${unit} (${unit === 100 ? "paise" : "rupees"})\n`);
  const amt = (rupees) => rupees * unit;

  // 2. Update Pro prices (clone the existing price object, change only the amount)
  await dodo.products.update(PRO_MONTHLY_ID, {
    price: { ...proMonthly.price, price: amt(TARGET.proMonthly) },
  });
  console.log(`✓ Pro Monthly updated → ₹${TARGET.proMonthly}`);

  await dodo.products.update(PRO_YEARLY_ID, {
    price: { ...proYearly.price, price: amt(TARGET.proYearly) },
  });
  console.log(`✓ Pro Yearly updated → ₹${TARGET.proYearly}\n`);

  // 3. Create Business products by cloning the Pro schema (monthly→monthly, yearly→yearly)
  const baseCreate = (template, name, rupees) => ({
    name,
    description: `${name} plan — Claude-powered AI for growing teams`,
    tax_category: template.tax_category,
    price: { ...template.price, price: amt(rupees) },
  });

  const bizMonthly = await dodo.products.create(
    baseCreate(proMonthly, "Invio Business (Monthly)", TARGET.businessMonthly)
  );
  console.log(`✓ Business Monthly created → ₹${TARGET.businessMonthly}  id: ${bizMonthly.product_id}`);

  const bizYearly = await dodo.products.create(
    baseCreate(proYearly, "Invio Business (Yearly)", TARGET.businessYearly)
  );
  console.log(`✓ Business Yearly created → ₹${TARGET.businessYearly}  id: ${bizYearly.product_id}\n`);

  console.log("──────────────────────────────────────────────");
  console.log("Paste these into src/lib/plans.ts:");
  console.log(`  PRO_MONTHLY.productId      = "${PRO_MONTHLY_ID}"  (price updated)`);
  console.log(`  PRO_YEARLY.productId       = "${PRO_YEARLY_ID}"  (price updated)`);
  console.log(`  BUSINESS_MONTHLY.productId = "${bizMonthly.product_id}"`);
  console.log(`  BUSINESS_YEARLY.productId  = "${bizYearly.product_id}"`);
  console.log("──────────────────────────────────────────────");
}

main().catch((e) => {
  console.error("\n✗ Failed:", e?.message || e);
  if (e?.response) console.error(JSON.stringify(e.response?.data || e.response, null, 2));
  process.exit(1);
});
