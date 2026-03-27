import { NextRequest, NextResponse } from "next/server";
import { groq } from "@/lib/groq";
import { Invoice } from "@/types/invoice";
import { createClient } from "@/lib/supabase/server";

interface LearnedExample {
  original_transcript: string;
  user_corrected: any;
}

const getExtractionPrompt = (outputLang: string, learnedExamples: LearnedExample[] = []) => {
  const langInstructions: Record<string, string> = {
    en: "Output all item names, units, and buyer names in ENGLISH.",
    hi: "Output all item names, units, and buyer names in HINDI (Devanagari script).",
    mr: "Output all item names, units, and buyer names in MARATHI (Devanagari script).",
  };

  // Build learned examples section if we have corrections from this business
  let learnedSection = "";
  if (learnedExamples.length > 0) {
    learnedSection = `
LEARNED FROM THIS BUSINESS (use these as reference for how this user prefers data):
${learnedExamples.map((ex, i) => `
Example ${i + 1}:
Input: "${ex.original_transcript}"
Correct output: ${JSON.stringify(ex.user_corrected, null, 2)}
`).join("\n")}
---
`;
  }

  return `You are an expert invoice field extractor for an Indian billing app.
Extract structured invoice data from the following voice transcript.
The transcript may be in Hindi, Marathi, English, or a mix (code-switching is common).

OUTPUT LANGUAGE: ${langInstructions[outputLang] || langInstructions.en}
${learnedSection}
CRITICAL RULES:
1. Listen carefully to EXACT numbers mentioned. Do NOT round or change them.
2. "sau" = 100, "hazaar/hazar" = 1000, "lakh" = 100000
3. "chhe sau" = 600, "chhe hazaar" = 6000 — be precise!
4. If quantity is not mentioned, assume 1
5. Parse Hindi numbers: ek=1, do=2, teen=3, char=4, paanch=5, chhe=6, saat=7, aath=8, nau=9, das=10
6. "rupaye/rupay/rs" indicates price, "percent/pratishat" indicates GST

PRICE INTERPRETATION:
- For grocery items (wheat, flour, dal, rice, sugar, oil, vegetables), treat the mentioned price as TOTAL for that quantity
- Example: "4 kg wheat Rs 200" → amount=200, rate=200/4=50
- Example: "1 kg Toor Dal Rs 300" → amount=300, rate=300/1=300
- If user says "per kg" or "rate" explicitly, then treat as per-unit rate

Return ONLY a valid JSON object with these fields:
- buyer_name (string or null)
- items (array of objects with: name, quantity, unit, rate, gst_percent, amount)
- subtotal (number or null)
- gst_amount (number or null)
- total (number or null)
- notes (string or null)

For each item, ALWAYS calculate:
- amount = the total price mentioned by user for that item
- rate = amount / quantity (per-unit rate)

Calculate totals:
- subtotal = sum of all item amounts
- gst_amount = subtotal * (gst_percent / 100)
- total = subtotal + gst_amount

If a field is not mentioned, use null. Do NOT guess values.
Return ONLY the JSON object, no markdown, no explanation, no extra text.

Transcript: "{transcript}"`;
};

export async function POST(request: NextRequest) {
  try {
    const { transcript, outputLanguage = "en" } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript provided" },
        { status: 400 }
      );
    }

    // Fetch learned examples from user's past corrections
    let learnedExamples: LearnedExample[] = [];
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("business_id")
          .eq("id", user.id)
          .single();

        if (userData?.business_id) {
          const { data: feedback } = await supabase
            .from("ai_feedback")
            .select("original_transcript, user_corrected")
            .eq("business_id", userData.business_id)
            .order("created_at", { ascending: false })
            .limit(3);

          if (feedback) {
            learnedExamples = feedback;
          }
        }
      }
    } catch (e) {
      // Ignore errors fetching feedback - table might not exist yet
    }

    const prompt = getExtractionPrompt(outputLanguage, learnedExamples).replace("{transcript}", transcript);

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

    let responseText = completion.choices[0]?.message?.content || "";

    // Strip markdown code blocks if present (Llama sometimes wraps JSON in ```)
    responseText = responseText
      .replace(/^```json?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    // Also try to extract JSON if it's wrapped in other text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      responseText = jsonMatch[0];
    }

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
