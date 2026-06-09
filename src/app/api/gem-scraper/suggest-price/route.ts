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

    const bidContext = `
Bid Number: ${bid.gem_bid_id}
Title: ${bid.title}
Category: ${bid.category || "N/A"}
Department: ${bid.department || "N/A"}
Quantity: ${bid.quantity || "N/A"} ${bid.uom || ""}
Buyer's Estimated Value (Budget): ₹${bid.estimated_value?.toLocaleString("en-IN") || "Not disclosed"}
Evaluation Method: ${bid.ai_evaluation_method || "L1 (likely lowest bidder wins)"}
Risk Assessment: ${bid.ai_risk_assessment || "N/A"}
${bid.raw_full_text ? `Specifications:\n${bid.raw_full_text.substring(0, 3000)}` : ""}
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
6. Consider current Indian market rates for this category of goods/services

Return ONLY valid JSON:
{
  "recommended_price": 950000,
  "price_range": { "aggressive": 850000, "comfortable": 1050000 },
  "unit_price": 5000,
  "unit_price_label": "per unit / per piece / per kg (whichever applies)",
  "strategy": "L1 Aggressive | L1 Balanced | Value-Based",
  "discount_from_estimate": 12,
  "reasoning": "3-4 sentence explanation of why this price, referencing market rates, competition level, and MSME preference if applicable",
  "market_context": "Brief note on current market rates for this item in India",
  "profit_margin_estimate": "15-20%",
  "cautions": ["any risks at this price point"]
}

If estimated value is not disclosed, base on market knowledge of the item.
Return ONLY the JSON, no markdown.`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      tier: "enhanced",
      temperature: 0.2,
      maxTokens: 1024,
    });

    let suggestion: any;
    try {
      const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
      const match = cleaned.match(/\{[\s\S]*\}/);
      suggestion = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "AI failed to parse pricing suggestion" }, { status: 422 });
    }

    // Persist the suggestion on the bid record
    await supabase
      .from("gem_bids")
      .update({
        ai_match_reason: suggestion.reasoning,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bid_id);

    return NextResponse.json(suggestion);
  } catch (err: any) {
    console.error("suggest-price error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
