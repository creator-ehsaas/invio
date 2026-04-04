import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { stats, period } = await request.json();

    const periodLabels: Record<string, string> = {
      this_month: "this month",
      last_month: "last month",
      this_quarter: "this quarter",
      this_year: "this financial year",
    };

    const prompt = `You are a financial advisor and CA for an Indian SME/trader. Analyze these business metrics and give 3-4 SHORT actionable insights.

Period: ${periodLabels[period] || period}
Sales (paid invoices): ₹${stats.totalRevenue?.toLocaleString("en-IN")} | ${stats.invoiceCount} invoices
Total billed (including unpaid): ₹${stats.subtotalSum?.toLocaleString("en-IN")}
Purchases: ₹${stats.totalPurchases?.toLocaleString("en-IN")} | ${stats.purchaseCount} bills
GST collected: ₹${stats.gstCollected?.toLocaleString("en-IN")}
ITC available: ₹${stats.itcAvailable?.toLocaleString("en-IN")}
Net GST payable: ₹${stats.netGstPayable?.toLocaleString("en-IN")}
Gross profit (approx): ₹${((stats.subtotalSum || 0) - (stats.totalPurchases || 0)).toLocaleString("en-IN")}
Avg invoice: ₹${stats.avgInvoiceValue?.toLocaleString("en-IN")}

Give insights as bullet points (use • symbol), each max 25 words:
• First insight about revenue/sales performance
• Second insight about GST/ITC position
• Third insight about business health or working capital
• Optional: one actionable recommendation

Do not use generic phrases. Be specific to the numbers. Speak like a knowledgeable Indian CA.`;

    const insight = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.4,
      maxTokens: 300,
    });

    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: "Could not generate insights." });
  }
}
