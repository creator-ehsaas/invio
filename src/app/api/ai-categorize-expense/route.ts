import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { description, categories } = await request.json();

    const prompt = `You are a smart accounting assistant for an Indian business. Given an expense description, categorize it and extract details.

Available categories: ${categories.join(", ")}

Expense description: "${description}"

Return ONLY valid JSON:
{
  "category": "best matching category from the list above, or null if none fits",
  "vendor": "vendor/payee name if mentioned in description, or null",
  "isItc": true/false (true only if this is a business expense on goods/services with GST, like raw materials, equipment, professional services)
}

Rules:
- Match category exactly as spelled in the list
- isItc = true for: purchases for resale, professional services, equipment, raw materials
- isItc = false for: salaries, personal expenses, food for staff, rent for residential
- vendor: extract if clearly mentioned (e.g. "Airtel bill" → vendor: "Airtel")`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.1,
      maxTokens: 200,
    });

    // Parse JSON
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const data = JSON.parse(match[0]);
      return NextResponse.json(data);
    }

    return NextResponse.json({ category: null, vendor: null, isItc: false });
  } catch {
    return NextResponse.json({ category: null, vendor: null, isItc: false });
  }
}
