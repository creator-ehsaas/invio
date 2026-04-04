import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    const prompt = `You are an estimate/quotation parser for an Indian business.
Extract estimate data from this speech and return a JSON object.

Speech: "${transcript}"

Return JSON with this exact structure:
{
  "customer_name": "string or null",
  "notes": "string or null",
  "terms": "string or null",
  "items": [
    {
      "description": "item name",
      "quantity": number,
      "unit": "pcs/kg/ltr/m/nos/box",
      "rate": number,
      "gst_rate": 0|5|12|18|28,
      "hsn_code": "string or null"
    }
  ]
}

Rules:
- Infer GST rate from item type (food/grains=5%, electronics/services=18%)
- If rate not mentioned, leave as 0
- unit defaults to "pcs" if unclear
- Return ONLY valid JSON, no explanation`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.1,
      maxTokens: 800,
    });

    let cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    const data = JSON.parse(cleaned);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: null, error: "Could not parse estimate" });
  }
}
