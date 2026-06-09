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
      .select("id, gem_bid_id, title, department, category, quantity, estimated_value, end_date, ai_summary")
      .eq("business_id", businessId)
      .eq("status", "new")
      .order("scraped_at", { ascending: false })
      .limit(60);

    if (!bids || bids.length === 0) {
      return NextResponse.json({ shortlisted: 0, scored: 0, message: "No new bids to score" });
    }

    const profileSummary = `Business: ${profile.ai_capability_summary || "Not available"}
Categories: ${(profile.ai_product_categories || []).join(", ") || "Not specified"}
MSME: ${profile.msme_category || "none"} | Turnover: ₹${profile.turnover_fy1 || 0}L
Bid Range: ₹${profile.ai_typical_bid_min?.toLocaleString("en-IN") || "?"} – ₹${profile.ai_typical_bid_max?.toLocaleString("en-IN") || "?"}
Certifications: ${(profile.certifications || []).join(", ") || "none"}
States: ${(profile.supply_states || []).join(", ") || "any"}
Gaps: ${(profile.ai_eligibility_gaps || []).join("; ") || "none"}`.trim();

    const BATCH = 15;
    let shortlistedCount = 0;
    let scoredCount = 0;

    for (let i = 0; i < bids.length; i += BATCH) {
      const batch = bids.slice(i, i + BATCH);

      const bidsText = batch.map((bid, j) =>
        `[${j + 1}] ID:${bid.id}\nTitle:${bid.title}\nDept:${bid.department || "N/A"} | Cat:${bid.category || "N/A"}\nQty:${bid.quantity || "?"} | Value:₹${bid.estimated_value?.toLocaleString("en-IN") || "N/A"} | Closes:${bid.end_date ? new Date(bid.end_date).toLocaleDateString("en-IN") : "N/A"}${bid.ai_summary ? `\nNote:${bid.ai_summary.substring(0, 100)}` : ""}`
      ).join("\n\n");

      const prompt = `GeM bid advisor for Indian SME.

${profileSummary}

Score each bid (0-100) for fit. 90-100=perfect, 70-89=good, 50-69=partial, 0-49=poor.

${bidsText}

Return ONLY JSON array:
[{"id":"uuid","score":85,"reason":"one line reason"}]`;

      const raw = await aiChat([{ role: "user", content: prompt }], {
        tier: "standard",
        temperature: 0.1,
        maxTokens: 1024,
      });

      let scores: { id: string; score: number; reason: string }[];
      try {
        const cleaned = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
        const match = cleaned.match(/\[[\s\S]*\]/);
        scores = JSON.parse(match ? match[0] : cleaned);
      } catch {
        continue;
      }

      scoredCount += scores.length;
      for (const { id, score, reason } of scores) {
        const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
        const newStatus = clampedScore >= 70 ? "shortlisted" : "new";
        if (newStatus === "shortlisted") shortlistedCount++;
        await supabase
          .from("gem_bids")
          .update({ ai_match_score: clampedScore, ai_match_reason: reason, status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("business_id", businessId);
      }
    }

    return NextResponse.json({
      shortlisted: shortlistedCount,
      scored: scoredCount,
    });
  } catch (err: any) {
    console.error("shortlist error:", err);
    return NextResponse.json({ error: err.message || "Shortlisting failed" }, { status: 500 });
  }
}
