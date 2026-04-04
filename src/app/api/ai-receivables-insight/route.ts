import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { totalOutstanding, buckets, invoiceCount } = await request.json();

    const bucketBreakdown = buckets
      .map((b: { label: string; count: number; total: number }) => `${b.label}: ${b.count} invoices, ₹${b.total.toLocaleString("en-IN")}`)
      .join("; ");

    const highRiskAmount = buckets
      .filter((b: { label: string }) => b.label.includes("60") || b.label.includes("90"))
      .reduce((s: number, b: { total: number }) => s + b.total, 0);

    const prompt = `You are a collections advisor for an Indian SME. Analyze these aged receivables and give 2-3 actionable insights.

Total Outstanding: ₹${totalOutstanding?.toLocaleString("en-IN")}
Total Invoices: ${invoiceCount}
Breakdown: ${bucketBreakdown}
High-risk (60+ days): ₹${highRiskAmount?.toLocaleString("en-IN")}

Give insights as bullet points (use • symbol), each max 25 words:
• First: priority action based on aging (which bucket to focus on first)
• Second: risk assessment and potential bad debt
• Third: collection strategy suggestion (call/email/legal)

Be specific. Speak like a practical Indian credit controller.`;

    const insight = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.4,
      maxTokens: 200,
    });

    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: "Could not generate insights." });
  }
}
