import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";
import { Invoice } from "@/types/invoice";

const EXTRACTION_PROMPT = `You are an invoice field extractor for an Indian billing app.
Extract structured invoice data from the following voice transcript.
The transcript may be in Hindi, Marathi, English, or a mix.

Return ONLY a valid JSON object with these fields:
- buyer_name (string or null)
- items (array of objects with: name, quantity, unit, rate, gst_percent, amount)
- subtotal (number or null)
- gst_amount (number or null)
- total (number or null)
- notes (string or null)

For each item, calculate:
- amount = quantity * rate (if both provided)

Calculate totals:
- subtotal = sum of all item amounts
- gst_amount = subtotal * (gst_percent / 100) using the first item's GST rate if uniform
- total = subtotal + gst_amount

If a field is not mentioned, use null. Do not guess.
Return ONLY the JSON object, no markdown, no explanation.

Transcript: "{transcript}"`;

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    const prompt = EXTRACTION_PROMPT.replace("{transcript}", transcript);

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    });

    const responseText = completion.choices[0]?.message?.content || "";

    let invoice: Invoice;
    try {
      invoice = JSON.parse(responseText);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse invoice JSON", raw: responseText },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("Parse invoice error:", error);
    return NextResponse.json(
      { error: "Invoice parsing failed" },
      { status: 500 }
    );
  }
}
