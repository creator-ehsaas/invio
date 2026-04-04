import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    const prompt = `You are an inventory item extractor for an Indian business app.
Extract product/item details from this speech and return a JSON object.

Speech: "${transcript}"

Return JSON with this exact structure:
{
  "name": "product name",
  "description": "product description or null",
  "hsn_code": "HSN/SAC code or null",
  "unit": "pcs/kg/g/ltr/ml/m/cm/ft/box/pack/dozen/pair",
  "unit_price": number or 0,
  "current_stock": number or 0,
  "reorder_level": number or 10,
  "gst_rate": 0|5|12|18|28
}

Rules:
- Infer GST rate from product type (food=5%, most goods=18%, luxury=28%)
- unit defaults to "pcs"
- Return ONLY valid JSON, no explanation`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.1,
      maxTokens: 300,
    });

    let cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];

    const data = JSON.parse(cleaned);
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: null, error: "Could not parse item details" });
  }
}
