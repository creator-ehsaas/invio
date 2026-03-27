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
LEARNED FROM THIS BUSINESS (high priority - follow these patterns):
${learnedExamples.map((ex, i) => `
Example ${i + 1}:
Input: "${ex.original_transcript}"
Correct output: ${JSON.stringify(ex.user_corrected, null, 2)}
`).join("\n")}
---
`;
  }

  return `You are an expert invoice field extractor for Indian industrial/hardware traders.
Target market: Gandhibagh, Itwari (Nagpur), Lohar Chawl (Mumbai) - steel, hardware, fabrication supplies.
Extract structured invoice data from voice transcript in Hindi, Marathi, English, or mixed.

OUTPUT LANGUAGE: ${langInstructions[outputLang] || langInstructions.en}
${learnedSection}
═══════════════════════════════════════════════════════════════
PRODUCT VOCABULARY (Hindi/Marathi → English)
═══════════════════════════════════════════════════════════════
SHEETS & PLATES:
- patta/patra/शीट = Sheet, plate/प्लेट = Plate
- MS = Mild Steel, SS = Stainless Steel, GI = Galvanized Iron
- CR = Cold Rolled, HR = Hot Rolled, GP = Galvanized Plain
- Chequered/Chequer/Tractor Patti = Chequered Plate

BARS & STRUCTURAL:
- sariya/सरिया/छड़ = TMT Bar, gol patti = Round Bar
- chapta patti = Flat Bar, chokor patti = Square Bar
- angle/kona/kunna/कोना = Angle, channel = Channel
- beam/girder = I-Beam/H-Beam

PIPES & TUBES:
- pipe/nali/पाइप/नली = Pipe, tube/ट्यूब = Tube
- ERW = Electric Resistance Welded, Seamless = Seamless Pipe

FASTENERS:
- bolt/बोल्ट, nut/नट, washer/chakti/चकती, pench/screw = Screw
- rivet/keel = Rivet, anchor/gitti = Anchor

OTHER:
- bearing/goli bearing/बेरिंग = Ball Bearing
- taar/तार = Wire, chain/जंजीर = Chain
- bundle/gatta/गट्टा/बंडल = Bundle

═══════════════════════════════════════════════════════════════
UNITS OF MEASUREMENT (CRITICAL - never confuse with rate)
═══════════════════════════════════════════════════════════════
WEIGHT:
- ton/tonne/टन = Metric Ton (1000 kg) - ALWAYS a unit, NEVER a rate
- kwintal/quintal/क्विंटल = 100 kg
- kg/kilo/किलो = Kilogram
- gram/gm/ग्राम = Gram

QUANTITY:
- piece/pcs/pc/nag/नग/nos = Pieces
- dozen/darjan/दर्जन = 12 pieces
- gross/ग्रॉस = 144 pieces
- bundle/gatta/बंडल = Bundle (varies, typically 10-12 pcs)
- packet/pkt/पैकेट, box/dabba/डब्बा = Box/Packet

LENGTH:
- feet/ft/foot/फुट, meter/mtr/मीटर, inch/इंच
- rft = Running Feet, rm = Running Meter
- sqft = Square Feet, sqm = Square Meter

PATTERN: "[number] [unit]" → 400 ton, 50 kg, 100 pcs, 2 dozen
The word AFTER the number is the UNIT, not the rate!

═══════════════════════════════════════════════════════════════
DIMENSIONS & SPECIFICATIONS (include in item name)
═══════════════════════════════════════════════════════════════
SHEET SIZES (feet):
- "3×6", "4×8", "5×10", "5×20" = width × length in feet
- "4 by 8", "char bata aath" = 4×8 feet

THICKNESS:
- Gauge: "16G", "16 gauge", "solah gauge" = 16 Gauge (1.52mm)
- MM: "1mm", "1.5mm", "2mm" = thickness in millimeters
- Common: 10G=3.25mm, 12G=2.64mm, 14G=1.98mm, 16G=1.52mm, 18G=1.21mm, 20G=0.91mm

ANGLE/CHANNEL FORMAT:
- "50×50×5" = leg1 × leg2 × thickness (all in mm)
- "ISMC 100", "ISMC 150" = Indian Standard Medium Channel

TMT/BAR:
- "12mm", "16mm" = diameter
- "Fe-500", "Fe-500D", "Fe-550" = grade

BOLT FORMAT:
- "M12×50" = M12 thread, 50mm length
- "1/2×2 inch" = imperial size

SS GRADES:
- "304", "316", "202" = Stainless Steel grade
- "three o four" = 304

═══════════════════════════════════════════════════════════════
NUMBER PARSING
═══════════════════════════════════════════════════════════════
Hindi: ek=1, do=2, teen=3, char=4, paanch=5, chhe/chhah=6, saat=7, aath=8, nau=9, das=10
Multiples: gyarah=11, barah=12, bees=20, pachas=50, sau=100, hazaar/hazar=1000, lakh=100000
Examples: "chhe sau" = 600, "do hazaar" = 2000, "teen lakh" = 300000
IMPORTANT: "2,40,000" or "240000" or "do lakh chalis hazaar" = 240000

═══════════════════════════════════════════════════════════════
EXTRACTION PATTERNS (CRITICAL)
═══════════════════════════════════════════════════════════════
PATTERN A: "[dimensions] [product] [quantity] [unit], [amount]"
- "3×6 SS sheet 400 ton, 240000" → name="3×6 SS Sheet", qty=400, unit="ton", amount=240000, rate=600
- "2×6 fiber sheet 100 ton 90000" → name="2×6 Fiber Sheet", qty=100, unit="ton", amount=90000, rate=900
- "16G MS sheet 4×8 size 200 kg 15000" → name="16G MS Sheet 4×8", qty=200, unit="kg", amount=15000, rate=75

PATTERN B: "[product] [specification] [quantity] [unit] [amount]"
- "TMT 12mm Fe-500 50 kg 3500" → name="TMT 12mm Fe-500", qty=50, unit="kg", amount=3500, rate=70
- "angle 50×50×5 100 kg 7500" → name="Angle 50×50×5", qty=100, unit="kg", amount=7500, rate=75

PATTERN C: "[quantity] [unit] [product] [amount]"
- "100 pcs bolt M12×50 2000" → name="Bolt M12×50", qty=100, unit="pcs", amount=2000, rate=20
- "2 dozen nut M12 240" → name="Nut M12", qty=24, unit="pcs", amount=240, rate=10

PATTERN D: Bulk/weight-based (per kg rate implied)
- "sariya 16mm 2 bundle 5000" → name="TMT Bar 16mm", qty=2, unit="bundle", amount=5000, rate=2500

RATE CALCULATION:
- rate = amount / quantity (ALWAYS calculate, never take directly from speech)
- Exception: if user explicitly says "rate 75 rupees per kg" then use that rate

═══════════════════════════════════════════════════════════════
GST HANDLING
═══════════════════════════════════════════════════════════════
- "18% GST", "GST 18 percent", "aathara pratishat" = 18% GST
- "with GST", "GST ke saath" = GST included (common: 18% for steel/hardware)
- "without GST", "GST nahi" = 0% GST
- Most steel/hardware items: HSN 72xx-73xx = 18% GST

═══════════════════════════════════════════════════════════════
CUSTOMER NAME PATTERNS
═══════════════════════════════════════════════════════════════
- "X ke naam pe", "X ke naam se", "party X" = Customer is X
- "M/s", "Messrs" = Company prefix (keep in name)
- "Industries", "Traders", "Enterprises", "& Sons", "& Co" = Business suffix (keep)

═══════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════
Return ONLY valid JSON:
{
  "buyer_name": "Customer/Party name or null",
  "items": [
    {
      "name": "Full product name with ALL specs/dimensions",
      "quantity": number,
      "unit": "ton|kg|pcs|dozen|bundle|box|meter|feet|etc",
      "rate": number (amount/quantity),
      "gst_percent": number or null,
      "amount": number (total for this item)
    }
  ],
  "subtotal": sum of all amounts,
  "gst_amount": subtotal × (gst_percent/100),
  "total": subtotal + gst_amount,
  "notes": any special instructions or null
}

CRITICAL REMINDERS:
1. Dimensions (3×6, 4×8) go IN the item name, not as quantity
2. Unit comes AFTER quantity number (400 ton = qty:400, unit:ton)
3. Rate is CALCULATED as amount/quantity
4. Include ALL specifications in item name (grade, gauge, size, dimensions)
5. Never guess - use null if not mentioned

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
      max_tokens: 2048,
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
