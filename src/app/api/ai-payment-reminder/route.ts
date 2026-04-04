import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { customerName, invoiceNumber, amount, daysOverdue, businessName } = await request.json();

    const urgency =
      daysOverdue > 90 ? "very urgent, final notice tone"
      : daysOverdue > 60 ? "firm but professional"
      : daysOverdue > 30 ? "polite but assertive"
      : "gentle reminder";

    const prompt = `You are a collections assistant for ${businessName || "an Indian business"}.
Write a short WhatsApp payment reminder message (under 80 words) for this overdue invoice.

Customer: ${customerName}
Invoice: ${invoiceNumber}
Amount Due: ₹${amount?.toLocaleString("en-IN")}
Days Overdue: ${daysOverdue} days
Tone: ${urgency}

Write in a mix of polite Hindi-English (Hinglish) that Indian businesspeople use on WhatsApp.
Include: greeting, invoice reference, amount, payment request, and contact line.
No markdown, no asterisks — plain WhatsApp text only.`;

    const message = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.6,
      maxTokens: 200,
    });

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ message: "Could not generate reminder." });
  }
}
