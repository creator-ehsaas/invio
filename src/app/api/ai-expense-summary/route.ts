import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { expenses } = await request.json();

    if (!expenses || expenses.length === 0) {
      return NextResponse.json({ summary: "No expenses to analyze yet." });
    }

    // Aggregate by category
    const byCat: Record<string, number> = {};
    let totalAmount = 0;
    let itcTotal = 0;

    for (const e of expenses) {
      const cat = e.category_name || "Other";
      byCat[cat] = (byCat[cat] || 0) + (e.amount || 0);
      totalAmount += e.amount || 0;
      if (e.is_itc_eligible) itcTotal += e.gst_amount || 0;
    }

    const breakdown = Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `${cat}: ₹${amt.toLocaleString("en-IN")}`)
      .join(", ");

    const prompt = `You are a financial advisor for an Indian SME/trader. Analyze these business expenses and give ONE actionable insight in 2-3 sentences. Be specific and practical.

Total expenses: ₹${totalAmount.toLocaleString("en-IN")}
Category breakdown: ${breakdown}
ITC claimable: ₹${itcTotal.toLocaleString("en-IN")}
Number of entries: ${expenses.length}

Give ONE specific insight about:
- Which category is highest and whether it seems normal
- ITC optimization (if they're missing ITC claims)
- Cost reduction opportunities
- Any patterns that seem unusual

Keep it under 60 words. Speak like a local CA, not a chatbot.`;

    const summary = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.4,
      maxTokens: 150,
    });

    return NextResponse.json({ summary });
  } catch {
    return NextResponse.json({ summary: "Could not analyze expenses." });
  }
}
