import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";
import { buildTenderContext } from "@/lib/tender-context";

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

    const { bid_id } = await request.json();
    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const { data: bid } = await supabase
      .from("gem_bids")
      .select("*")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();
    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    const { data: profile } = await supabase
      .from("gem_business_profile")
      .select("ai_capability_summary, ai_product_categories, msme_category, turnover_fy1, ai_typical_bid_min, ai_typical_bid_max")
      .eq("business_id", userData.business_id)
      .maybeSingle();

    // Pull the analyzed financials and item-wise details — these contain any
    // unit rates the analysis extracted from the spec/BOQ documents
    let analyzedFinancials = "";
    let analyzedItems = "";
    try {
      const parsed = JSON.parse(bid.ai_summary || "{}");
      analyzedFinancials = parsed.sections?.financial_details || "";
      if (Array.isArray(parsed.item_details) && parsed.item_details.length) {
        analyzedItems = parsed.item_details
          .map((i: any) => `- ${i.item_name}: ${i.quantity} ${i.unit}${i.unit_price_estimate != null ? ` @ ₹${i.unit_price_estimate}/unit` : ""} (${i.specifications})`)
          .join("\n");
      }
    } catch { /* ai_summary may be plain text from older analyses */ }

    const bidContext = `
Bid Number: ${bid.gem_bid_id}
Title: ${bid.title}
Category: ${bid.category || "N/A"}
Department: ${bid.department || "N/A"}
Quantity: ${bid.quantity || "N/A"} ${bid.uom || ""}
Buyer's Estimated Value (Budget): ₹${bid.estimated_value?.toLocaleString("en-IN") || "Not disclosed"}
EMD: ₹${bid.ai_emd_amount?.toLocaleString("en-IN") || "N/A"}
Evaluation Method: ${bid.ai_evaluation_method || "L1 (likely lowest bidder wins)"}
Risk Assessment: ${bid.ai_risk_assessment || "N/A"}
${analyzedFinancials ? `Analyzed Financial Details: ${analyzedFinancials}` : ""}
${analyzedItems ? `Items (from analysis):\n${analyzedItems}` : ""}
${bid.raw_full_text ? `Specifications (raw):\n${buildTenderContext(bid.raw_full_text, 12000)}` : ""}
`.trim();

    const businessContext = profile ? `
Seller Profile:
- Business: ${profile.ai_capability_summary?.substring(0, 200) || "SME supplier"}
- Categories: ${(profile.ai_product_categories || []).join(", ") || "N/A"}
- MSME: ${profile.msme_category || "none"} (MSME gets price preference on GeM)
- Annual Turnover: ₹${profile.turnover_fy1 || 0}L
`.trim() : "";

    const prompt = `You are an expert GeM (Government e-Marketplace) bid pricing strategist for Indian SMEs.

${bidContext}

${businessContext}

Analyze this tender and suggest the most competitive bid price to WIN while maintaining a reasonable profit margin.

Consider:
1. The buyer's estimated value is their budget ceiling — bidding above it disqualifies you
2. GeM mostly uses L1 (lowest price wins) — but don't go so low you lose money
3. Government buyers expect 10-25% below estimated value for competitive bids
4. MSME sellers get up to 15% price preference — factor this in
5. Account for GST, delivery, and installation if applicable

Return ONLY valid JSON:
{
  "recommended_price": 950000,
  "price_range": { "aggressive": 850000, "comfortable": 1050000 },
  "unit_price": 5000,
  "unit_price_label": "per unit / per piece / per kg (whichever applies)",
  "strategy": "L1 Aggressive | L1 Balanced | Value-Based",
  "discount_from_estimate": 12,
  "pricing_basis": "buyer_estimate | extracted_rates | component_estimate",
  "seller_approach": "manufacturer | trader | service_provider",
  "confidence": "high | medium | low",
  "cost_breakdown": [
    { "component": "name of component/module/material", "spec": "key spec driving its cost", "qty": 10, "unit": "Nos", "indicative_unit_rate": 1200, "subtotal": 12000, "rate_basis": "what this indicative rate is based on" }
  ],
  "overheads": [ { "label": "Fabrication & labour / Packaging & logistics / Installation", "amount": 15000 } ],
  "estimated_cost_total": 135000,
  "margin_percent": 15,
  "verification_notes": ["component rates the seller should verify with suppliers before bidding"],
  "reasoning": "3-4 sentence explanation of how the price was derived and from what basis",
  "profit_margin_estimate": "15-20%",
  "cautions": ["any risks at this price point"]
}

PRICING BASIS — USE THIS LADDER, in order:
1. buyer_estimate — the buyer disclosed an estimated value. Price 10-25% below it. cost_breakdown = [], overheads = [], estimated_cost_total = null.
2. extracted_rates — no buyer estimate, but the specifications/BOQ contain unit rates or amounts. Build the price from those actual figures and show them in cost_breakdown with rate_basis "stated in tender document".
3. component_estimate — no estimate and no stated rates. Build the price BOTTOM-UP from the specification:
   - Decompose each item into its components/modules/materials/effort as described in the specs.
   - Assign each an indicative Indian market rate (realistic round figures) with rate_basis explaining what it's based on.
   - Choose seller_approach from the seller profile: manufacturer → materials + fabrication/labour + overheads; trader → procurement cost + packaging + logistics; service_provider → manpower/effort + materials + overheads.
   - estimated_cost_total = sum of subtotals + overheads. recommended_price = estimated_cost_total × (1 + margin_percent/100).
   - confidence MUST be "low" or "medium", and verification_notes MUST list every indicative rate the seller should verify with real suppliers before bidding.
- Only return recommended_price = null if the specification text is so thin that no components can even be identified — and say in reasoning that the tender documents must be fetched first.
- These indicative rates are estimates for the seller to verify — never present them as exact market prices, but DO commit to concrete figures so the seller has a starting point.
Return ONLY the JSON, no markdown.`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      tier: "enhanced",
      // Same bid must always yield the same suggestion
      temperature: 0,
      seed: 42,
      jsonMode: true,
      // Component-wise cost breakdowns need room
      maxTokens: 2500,
    });

    let suggestion: any;
    try {
      const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      suggestion = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "AI failed to parse pricing suggestion" }, { status: 422 });
    }

    // Persist the full suggestion so it stays stable across page loads.
    // (Do NOT touch ai_match_reason — that belongs to the shortlist scorer.)
    await supabase
      .from("gem_bids")
      .update({
        ai_price_suggestion: suggestion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bid_id);

    return NextResponse.json(suggestion);
  } catch (err: any) {
    console.error("suggest-price error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
