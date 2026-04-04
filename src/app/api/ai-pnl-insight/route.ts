import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { data, period } = await request.json();

    const periodLabels: Record<string, string> = {
      this_month: "this month",
      last_month: "last month",
      this_quarter: "this quarter",
      this_year: "this financial year",
    };

    const grossMargin = data.revenue > 0 ? ((data.grossProfit / data.revenue) * 100).toFixed(1) : 0;
    const netMargin = data.revenue > 0 ? ((data.netProfit / data.revenue) * 100).toFixed(1) : 0;

    const topExpenses = data.expensesByCategory
      .slice(0, 3)
      .map((e: { name: string; amount: number }) => `${e.name}: ₹${e.amount.toLocaleString("en-IN")}`)
      .join(", ");

    const prompt = `You are a CA/financial advisor for an Indian SME/trader. Analyze this P&L and give 3-4 SHORT insights.

Period: ${periodLabels[period] || period}
Revenue: ₹${data.revenue?.toLocaleString("en-IN")} (${data.invoiceCount} invoices)
COGS (Purchases): ₹${data.cogs?.toLocaleString("en-IN")} (${data.purchaseCount} purchases)
Gross Profit: ₹${data.grossProfit?.toLocaleString("en-IN")} (${grossMargin}% margin)
Total Expenses: ₹${data.totalExpenses?.toLocaleString("en-IN")} (${data.expenseCount} entries)
Top expenses: ${topExpenses || "none"}
Net Profit: ₹${data.netProfit?.toLocaleString("en-IN")} (${netMargin}% margin)

Give insights as bullet points (use • symbol), each max 25 words:
• First insight about profitability/margins (compare to typical Indian SME benchmarks)
• Second insight about COGS ratio or expense control
• Third insight about cash flow or working capital
• Optional: one actionable recommendation to improve profit

Be specific to the numbers. Speak like a practical Indian CA.`;

    const insight = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.4,
      maxTokens: 300,
    });

    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: "Could not generate insights." });
  }
}
