import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { customer, totalInvoiced, totalPaid, outstanding, invoiceCount, lastTransactionDate } = await request.json();

    const daysSinceLast = lastTransactionDate
      ? Math.floor((Date.now() - new Date(lastTransactionDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const paymentRate = totalInvoiced > 0 ? ((totalPaid / totalInvoiced) * 100).toFixed(0) : "0";

    const prompt = `You are a collections and business advisor for an Indian SME. Analyze this customer's payment behavior and give ONE actionable insight.

Customer: ${customer.name}${customer.gstin ? ` (GST registered: ${customer.gstin})` : ""}
Total invoiced: ₹${totalInvoiced?.toLocaleString("en-IN")}
Total paid: ₹${totalPaid?.toLocaleString("en-IN")}
Outstanding: ₹${outstanding?.toLocaleString("en-IN")}
Payment rate: ${paymentRate}%
Total invoices: ${invoiceCount}
Last transaction: ${daysSinceLast !== null ? `${daysSinceLast} days ago` : "no transactions"}

Give ONE specific insight in 2-3 sentences:
- If outstanding > 0: suggest how urgently to follow up (low/medium/high risk based on days and amount)
- If payment rate < 80%: flag as risky customer
- If excellent payer: note and suggest increasing credit limit or priority service
- If no recent activity: suggest re-engagement

Keep it under 60 words. Speak like a local CA or credit manager.`;

    const insight = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.4,
      maxTokens: 120,
    });

    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: "Could not generate insight." });
  }
}
