import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const businessId = userData.business_id;

    const body = await request.json().catch(() => ({}));
    const userDescription: string = body.user_description || "";
    const userCategories: string[] = body.user_categories || [];

    const { data: business } = await supabase
      .from("businesses")
      .select("name, gstin, address")
      .eq("id", businessId)
      .single();

    const { data: invoiceItems } = await supabase
      .from("invoice_items")
      .select("description, hsn_code, gst_rate, amount, quantity, unit")
      .in(
        "invoice_id",
        (
          await supabase
            .from("invoices")
            .select("id")
            .eq("business_id", businessId)
        ).data?.map((r: any) => r.id) ?? []
      )
      .limit(200);

    const { data: invoices } = await supabase
      .from("invoices")
      .select("total, invoice_date, customer_name, status")
      .eq("business_id", businessId)
      .eq("status", "paid")
      .order("invoice_date", { ascending: false })
      .limit(100);

    const { data: purchaseInvoices } = await supabase
      .from("purchase_invoices")
      .select("total, bill_date, supplier_name, status")
      .eq("business_id", businessId)
      .order("bill_date", { ascending: false })
      .limit(50);

    const invoiceSummary = invoices && invoices.length > 0
      ? `Paid invoices (${invoices.length} records):
- Total values: ₹${invoices.map((i: any) => i.total).join(", ₹")}
- Average invoice value: ₹${Math.round(invoices.reduce((s: number, i: any) => s + (i.total || 0), 0) / invoices.length).toLocaleString("en-IN")}
- Max invoice value: ₹${Math.max(...invoices.map((i: any) => i.total || 0)).toLocaleString("en-IN")}
- Customers (sample): ${invoices.slice(0, 10).map((i: any) => i.customer_name).filter(Boolean).join(", ")}`
      : "No invoice data available.";

    const itemSummary = invoiceItems && invoiceItems.length > 0
      ? `Invoice line items (${invoiceItems.length} records):
${invoiceItems.slice(0, 50).map((i: any) =>
  `- ${i.description}${i.hsn_code ? ` (HSN: ${i.hsn_code})` : ""}${i.gst_rate ? `, GST ${i.gst_rate}%` : ""}`
).join("\n")}`
      : "No invoice line item data available.";

    const purchaseSummary = purchaseInvoices && purchaseInvoices.length > 0
      ? `Purchase invoices (${purchaseInvoices.length} records):
- Total values: ${purchaseInvoices.slice(0, 20).map((i: any) => `₹${i.total?.toLocaleString("en-IN")}`).join(", ")}
- Suppliers: ${purchaseInvoices.slice(0, 10).map((i: any) => i.supplier_name).filter(Boolean).join(", ")}`
      : "No purchase data available.";

    const userContext = userDescription || userCategories.length > 0
      ? `\n--- Business Owner's Own Description ---\n${userDescription ? `Products/Services: ${userDescription}` : ""}${userCategories.length > 0 ? `\nSelected categories: ${userCategories.join(", ")}` : ""}`
      : "";

    const prompt = `You are an expert at analyzing Indian SME businesses for Government e-Marketplace (GeM) bid suitability.

Analyze the following business data and return a JSON capability profile.

Company: ${business?.name || "Unknown"}
GSTIN: ${business?.gstin || "Not provided"}
State: ${business?.address || "Not provided"}${userContext}

--- Sales Data ---
${invoiceSummary}

--- Products / Services Sold ---
${itemSummary}

--- Procurement Data ---
${purchaseSummary}

Return ONLY valid JSON with this exact structure:
{
  "ai_capability_summary": "2-3 sentence summary of what this business does, what they supply, at what scale, and their key strengths for GeM bidding",
  "ai_product_categories": ["category1", "category2"],
  "ai_recommended_categories": [
    {
      "category": "Exact GeM category name",
      "confidence": 85,
      "reasoning": "Why this category fits based on the data"
    }
  ],
  "ai_typical_bid_min": 50000,
  "ai_typical_bid_max": 2000000,
  "ai_eligibility_gaps": ["gap1 — e.g. No ISO 9001 certification likely needed for IT bids", "gap2"],
  "suggested_keywords": ["keyword1", "keyword2", "keyword3"]
}

Rules:
- ai_recommended_categories: list 3-5 specific GeM categories that match their products/services. Use actual GeM category names.
- ai_typical_bid_min/max: estimate the bid value range they can realistically fulfill (in INR, based on their invoice history).
- ai_eligibility_gaps: list 2-4 common eligibility gaps for their category (e.g., missing MSME cert, turnover threshold, specific licenses).
- If data is sparse, make reasonable estimates but flag them.
- Return ONLY the JSON, no markdown.`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      tier: "enhanced",
      temperature: 0.2,
      maxTokens: 2048,
    });

    let result: any;
    try {
      const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      result = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "AI analysis failed to parse" }, { status: 422 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("gem profile analyze error:", err);
    return NextResponse.json({ error: err.message || "Analysis failed" }, { status: 500 });
  }
}
