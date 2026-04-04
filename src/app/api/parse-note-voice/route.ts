import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { transcript, noteType } = await request.json();
    const label = noteType === "debit" ? "debit note / additional charge" : "credit note / return";

    const prompt = `You are a ${label} parser for an Indian business app.
Extract note details from this speech and return a JSON object.

Speech: "${transcript}"

Return JSON with this exact structure:
{
  "customer_name": "string or null",
  "reason": "return|discount|price_adjustment|undercharge|additional_service|price_increase|other",
  "notes": "string or null",
  "items": [
    {
      "description": "item name",
      "quantity": number,
      "unit": "pcs/kg/ltr/nos/box",
      "rate": number,
      "gst_rate": 0|5|12|18|28
    }
  ]
}

Rules:
- For credit notes: reason is usually "return", "discount", or "price_adjustment"
- For debit notes: reason is usually "undercharge", "additional_service", or "price_increase"
- Infer reason from speech context
- Return ONLY valid JSON, no explanation`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.1,
      maxTokens: 600,
    });

    let cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    const data = JSON.parse(cleaned);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: null, error: "Could not parse note details" });
  }
}
