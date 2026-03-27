/**
 * Script to create Dodo Payments subscription products
 * Run with: npx tsx scripts/setup-dodo-products.ts
 */

async function main() {
  const API_KEY = "_oVBVTH6bGy-fLa0.r-3K_iYc0jdRq_et6o_DfwnQgETnflf3dojPGMldi-eRx7tl";
  const BASE_URL = "https://test.dodopayments.com";

  console.log("Creating Dodo Payments subscription products...\n");

  try {
    // Create Pro Monthly product
    const proMonthlyRes = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Invio Pro Monthly",
        description: "Unlimited invoices, all templates, AI learning, business insights",
        price: {
          currency: "INR",
          type: "recurring_price",
          billing_period: "month",
          unit_amount: 49900, // 499.00 INR in paise
        },
        tax_category: "digital_products",
      }),
    });

    if (!proMonthlyRes.ok) {
      const err = await proMonthlyRes.text();
      console.error("Pro Monthly error:", proMonthlyRes.status, err);
    } else {
      const proMonthly = await proMonthlyRes.json();
      console.log("✓ Pro Monthly created:");
      console.log(`  Product ID: ${proMonthly.product_id}`);
    }

    // Create Pro Yearly product
    const proYearlyRes = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Invio Pro Yearly",
        description: "Everything in Pro Monthly + 2 months free, early access, dedicated support",
        price: {
          currency: "INR",
          type: "recurring_price",
          billing_period: "year",
          unit_amount: 499900, // 4999.00 INR in paise
        },
        tax_category: "digital_products",
      }),
    });

    if (!proYearlyRes.ok) {
      const err = await proYearlyRes.text();
      console.error("Pro Yearly error:", proYearlyRes.status, err);
    } else {
      const proYearly = await proYearlyRes.json();
      console.log("✓ Pro Yearly created:");
      console.log(`  Product ID: ${proYearly.product_id}`);
    }

  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

main();
