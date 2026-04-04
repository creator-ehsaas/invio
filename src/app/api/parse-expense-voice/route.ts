import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { transcript, categories } = await request.json();

    const prompt = `You are an accounting assistant for an Indian SME. Extract expense details from this voice input.

Available categories: ${(categories || []).join(", ")}
Today: ${new Date().toISOString().split("T")[0]}

Voice input: "${transcript}"

Return ONLY valid JSON:
{
  "description": "Clear expense description",
  "amount": number or null,
  "vendor_name": "vendor name or null",
  "category": "matching category from list or null",
  "payment_method": "cash|bank|upi|card|cheque|other",
  "notes": "any extra info or null"
}

Examples:
- "paid 5000 rent to landlord Sharma" → description: "Monthly rent", amount: 5000, category: "Rent", vendor_name: "Sharma"
- "electricity bill 2300 rupees by upi" → description: "Electricity bill", amount: 2300, category: "Utilities", payment_method: "upi"
- "bought stationery 450 cash from Sharma stationers" → description: "Stationery purchase", amount: 450, category: "Office Supplies", vendor_name: "Sharma Stationers", payment_method: "cash"`;

    const raw = await aiChat([{ role: "user", content: prompt }], {
      temperature: 0.1,
      maxTokens: 400,
    });

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ expense: null });

    const expense = JSON.parse(match[0]);
    return NextResponse.json({ expense });
  } catch {
    return NextResponse.json({ expense: null });
  }
}
