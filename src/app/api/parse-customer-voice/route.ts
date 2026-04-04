import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    const prompt = `You are a customer data extractor for an Indian business app.
Extract customer details from this speech and return a JSON object.

Speech: "${transcript}"

Return JSON with this exact structure:
{
  "name": "contact person name or null",
  "business_name": "company/shop name or null",
  "phone": "10-digit mobile number or null",
  "email": "email address or null",
  "gstin": "15-character GSTIN or null",
  "city": "city name or null",
  "state": "Indian state name or null",
  "pincode": "6-digit pincode or null",
  "street": "street address or null"
}

Rules:
- Phone numbers: extract digits only, must be 10 digits
- GSTIN: 15 alphanumeric characters
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
    return NextResponse.json({ data: null, error: "Could not parse customer details" });
  }
}
