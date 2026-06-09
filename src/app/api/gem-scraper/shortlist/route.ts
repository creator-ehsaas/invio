import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";
import type { GemBusinessProfile } from "@/types/gem";

export async function POST(_request: NextRequest) {
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

    const { data: profile } = await supabase
      .from("gem_business_profile")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle() as { data: GemBusinessProfile | null };

    if (!profile?.setup_completed) {
      return NextResponse.json(
        { error: "Complete the GeM setup wizard first at /bids/setup" },
        { status: 400 }
      );
    }

    const { data: bids } = await supabase
      .from("gem_bids")
      .select("id, gem_bid_id, title, department, organization, category, quantity, uom, estimated_value, end_date, bid_type, ai_summary, raw_full_text")
      .eq("business_id", businessId)
      .eq("status", "new")
      .order("scraped_at", { ascending: false })
      .limit(50);

    if (!bids || bids.length === 0) {
      return NextResponse.json({ shortlisted: 0, scored: 0, message: "No new bids to score" });
    }

    const profileSummary = `
Business Capability Profile:
- Summary: ${profile.ai_capability_summary || "Not available"}
- Categories: ${(profile.ai_product_categories || []).join(", ") || "Not specified"}
- MSME: ${profile.msme_category || "Not registered"}
- Annual Turnover: ₹${profile.turnover_fy1 || 0}L (FY24-25), ₹${profile.turnover_fy2 || 0}L (FY23-24)
- Years in Business: ${profile.years_in_business || "Unknown"}
- Certifications: ${(profile.certifications || []).join(", ") || "None specified"}
- Supply States: ${(profile.supply_states || []).join(", ") || "Not specified"}
- Typical Bid Range: ₹${profile.ai_typical_bid_min?.toLocaleString("en-IN") || "?"} – ₹${profile.ai_typical_bid_max?.toLocaleString("en-IN") || "?"}
- Known Eligibility Gaps: ${(profile.ai_eligibility_gaps || []).join("; ") || "None identified"}
    `.trim();

    const bidsText = bids.map((bid, i) => `
[${i + 1}] ID: ${bid.id}
  Title: ${bid.title}
  Dept: ${bid.department || "N/A"} | Category: ${bid.category || "N/A"}
  Qty: ${bid.quantity || "?"} ${bid.uom || ""} | Value: ₹${bid.estimated_value?.toLocaleString("en-IN") || "N/A"}
  Closes: ${bid.end_date ? new Date(bid.end_date).toLocaleDateString("en-IN") : "N/A"}
  ${bid.ai_summary ? `Summary: ${bid.ai_summary.substring(0, 200)}` : ""}
  ${bid.raw_full_text ? `Spec excerpt: ${bid.raw_full_text.substring(0, 500)}` : ""}
`.trim()).join("\n\n");

    const prompt = `You are an expert GeM (Government e-Marketplace) bid advisor for Indian SMEs.

${profileSummary}

Rate each of the following ${bids.length} bids on how well they match this business.
Consider: category match, bid value within their range, eligibility (MSME/certs), supply state match.

${bidsText}

Return ONLY a valid JSON array — one object per bid, in the same order:
[
  {
    "id": "exact-uuid-from-bid",
    "score": 85,
    "reason": "Strong match: IT services category aligns perfectly, value ₹5L within their range, MSME preferred"
  }
]

Scoring guide:
- 90-100: Perfect match — category, value, eligibility all align
- 70-89: Good match — 2 out of 3 criteria strongly align
- 50-69: Partial match — some overlap but concerns (e.g. value too high, missing cert)
- 0-49: Poor match — wrong category or company clearly not eligible

Return ONLY the JSON array, no markdown fences.`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      tier: "enhanced",
      temperature: 0.1,
      maxTokens: 4096,
    });

    let scores: { id: string; score: number; reason: string }[];
    try {
      const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
      const match = cleaned.match(/\[[\s\S]*\]/);
      scores = JSON.parse(match ? match[0] : cleaned);
    } catch {
      return NextResponse.json({ error: "AI scoring failed to parse" }, { status: 422 });
    }

    let shortlistedCount = 0;
    for (const { id, score, reason } of scores) {
      const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
      const newStatus = clampedScore >= 70 ? "shortlisted" : "new";
      if (newStatus === "shortlisted") shortlistedCount++;

      await supabase
        .from("gem_bids")
        .update({
          ai_match_score: clampedScore,
          ai_match_reason: reason,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("business_id", businessId);
    }

    return NextResponse.json({
      shortlisted: shortlistedCount,
      scored: scores.length,
    });
  } catch (err: any) {
    console.error("shortlist error:", err);
    return NextResponse.json({ error: err.message || "Shortlisting failed" }, { status: 500 });
  }
}
