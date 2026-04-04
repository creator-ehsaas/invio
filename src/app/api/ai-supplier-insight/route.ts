import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { supplier, totalPurchases, totalPaid, pendingAmount, purchaseCount, lastPurchaseDate } = await request.json();

    const daysSinceLast = lastPurchaseDate
      ? Math.floor((Date.now() - new Date(lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const prompt = `You are a supply chain and finance advisor for an Indian SME. Analyze this supplier relationship and give ONE actionable insight.

Supplier: ${supplier.name}${supplier.gstin ? ` (GST: ${supplier.gstin})` : " (unregistered/no GSTIN)"}
Payment terms: ${supplier.payment_terms === 0 ? "Due on receipt" : `Net ${supplier.payment_terms} days`}
Total purchased: ₹${totalPurchases?.toLocaleString("en-IN")}
Total paid: ₹${totalPaid?.toLocaleString("en-IN")}
Outstanding payable: ₹${pendingAmount?.toLocaleString("en-IN")}
Purchase count: ${purchaseCount}
Last purchase: ${daysSinceLast !== null ? `${daysSinceLast} days ago` : "no purchases yet"}

Give ONE insight in 2-3 sentences about:
- Payment risk or schedule based on outstanding vs terms
- If no GSTIN: ITC impact note
- Supplier dependency if purchase volume is high
- Re-order or relationship suggestion

Keep it under 60 words. Speak like an Indian business consultant.`;

    const insight = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.4,
      maxTokens: 120,
    });

    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: "Could not generate insight." });
  }
}
