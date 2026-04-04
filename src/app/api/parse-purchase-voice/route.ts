import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";

const PURCHASE_VOICE_PROMPT = `You are an expert at extracting purchase bill data from voice transcripts for Indian traders/manufacturers.
The user is dictating details of a bill they received from a supplier.

Extract: supplier name, bill number, date, and all purchased items.

Return ONLY valid JSON:
{
  "supplier_name": "Vendor name or null",
  "bill_number": "Bill/Invoice number or null",
  "bill_date": "YYYY-MM-DD or null",
  "items": [
    {
      "description": "Full item name with specs (grade, size, dimensions)",
      "hsn_code": null,
      "quantity": number,
      "unit": "kg/ton/pcs/mtr/box/bundle/etc",
      "rate": number (per unit excluding GST),
      "gst_rate": 0/5/12/18/28
    }
  ],
  "notes": "any notes or null"
}

VOCABULARY (Hindi/Marathi → item type):
- sariya/saria = TMT Bar, angle/kona = Angle, patta/sheet = Sheet/Plate
- pipe/nali = Pipe, bolt/nut/pench = Fasteners, bearing = Ball Bearing
- ton/tonne = metric ton (1000kg), quintal/kwintal = 100kg, kilo/kg = kilogram
- nag/piece/pcs = pieces, bundle/gatta = bundle

NUMBER PARSING:
- ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10
- bees=20, pachas=50, sau=100, hazaar=1000, lakh=100000

RULES:
- rate = amount ÷ quantity (calculate if only total given)
- GST rates: steel/metal=18%, most goods=18%, food/agri=5%
- Default GST to 18% if not mentioned

Transcript: "{transcript}"`;

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: "No transcript" }, { status: 400 });
    }

    const prompt = PURCHASE_VOICE_PROMPT.replace("{transcript}", transcript);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 2048,
    });

    let raw = completion.choices[0]?.message?.content || "";
    raw = raw.replace(/^```json?\s*\n?/im, "").replace(/\n?```\s*$/im, "").trim();
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) raw = match[0];

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Parse failed" }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Parse purchase voice error:", error);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
