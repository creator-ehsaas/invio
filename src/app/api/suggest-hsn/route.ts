import { NextRequest, NextResponse } from "next/server";
import { aiChat } from "@/lib/ai-client";

export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();

    if (!description || typeof description !== "string" || !description.trim()) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }

    const prompt = `You are an expert on Indian GST, HSN (Harmonized System of Nomenclature) codes, and SAC (Services Accounting Codes).
Identify the most accurate 4-digit or 6-digit HSN/SAC code and the standard GST rate (0, 5, 12, 18, or 28) for the given item description.

Provide your response in ONLY valid raw JSON with this exact structure:
{
  "hsn_code": "string (4 to 8 digits HSN or SAC)",
  "gst_rate": number (0, 5, 12, 18, or 28),
  "description": "Short official HSN/SAC category description",
  "explanation": "Brief explanation of why this applies"
}

RULES:
- Output ONLY valid JSON.
- No markdown formatting, no code block markers (like \`\`\`json).
- If description matches steel/metal/hardware/tools, use 18% GST (common codes: 7208 to 7326).
- If description matches services, use 18% GST (common SAC codes start with 99).

Item Description: "${description.replace(/"/g, '\\"')}"`;

    const rawResponse = await aiChat([
      { role: "user", content: prompt }
    ], {
      temperature: 0.1,
      maxTokens: 500,
    });

    let cleanedResponse = rawResponse.trim();
    // Strip markdown code fences if present
    cleanedResponse = cleanedResponse
      .replace(/^```json?\s*\n?/im, "")
      .replace(/\n?```\s*$/im, "")
      .trim();

    // Extract JSON block if surrounded by text
    const match = cleanedResponse.match(/\{[\s\S]*\}/);
    if (match) {
      cleanedResponse = match[0];
    }

    const data = JSON.parse(cleanedResponse);
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Suggest HSN error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to suggest HSN" },
      { status: 500 }
    );
  }
}
