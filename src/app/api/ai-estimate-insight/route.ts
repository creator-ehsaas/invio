import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";

export async function POST(request: NextRequest) {
  try {
    const { estimate } = await request.json();

    const today = new Date().toISOString().split("T")[0];
    const validUntil = estimate.valid_until;
    const daysLeft = validUntil
      ? Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    const prompt = `You are a business advisor for an Indian SME/trader/manufacturer. Analyze this estimate and give ONE actionable insight in 2-3 sentences. Be direct and practical.

Estimate:
- Customer: ${estimate.customer_name || "Unknown"}
- Total: ₹${estimate.total?.toLocaleString("en-IN")}
- Status: ${estimate.status}
- Valid Until: ${validUntil || "Not set"} (${daysLeft !== null ? `${daysLeft} days ${daysLeft < 0 ? "EXPIRED" : "remaining"}` : "no expiry"})
- Items: ${estimate.items?.map((i: any) => `${i.description} (${i.quantity} × ₹${i.rate})`).join(", ")}
- Notes: ${estimate.notes || "None"}

Today: ${today}

Give ONE specific insight about:
- If expired/expiring soon: urgency to follow up
- If draft: should it be sent now?
- Pricing competitiveness for the Indian market
- Win probability and what might help close the deal
- Any red flags or missing information

Keep it under 60 words. Speak like a knowledgeable local business advisor, not a chatbot.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 150,
    });

    const insight = completion.choices[0]?.message?.content?.trim() || "No insight available.";
    return NextResponse.json({ insight });
  } catch (error: any) {
    return NextResponse.json({ insight: "Could not generate insight." }, { status: 500 });
  }
}
