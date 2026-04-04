import { NextRequest, NextResponse } from "next/server";
import { aiVision, aiChat } from "@/lib/ai-client";

const MAX_SIZE = 10 * 1024 * 1024;

const RECEIPT_PROMPT = `You are an expert at reading Indian receipts, bills, and expense documents.
Extract expense information from this receipt.

Return ONLY valid JSON:
{
  "description": "What the expense is for (brief, clear)",
  "vendor_name": "Shop/company name",
  "amount": total amount paid as number (including GST if shown),
  "gst_amount": GST component as number or 0,
  "expense_date": "YYYY-MM-DD format",
  "category": one of: "Rent|Salaries|Utilities|Transport|Marketing|Repairs|Office Supplies|Petty Cash|Bank Charges|Other",
  "payment_method": one of: "cash|bank|upi|card|cheque|other",
  "notes": "any relevant notes or null",
  "is_itc_eligible": true if GST is shown and it's a business expense
}

If a field is not visible, use null. Never make up data.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large" }, { status: 400 });

    const mimeType = file.type;
    const isPDF = mimeType === "application/pdf";
    const isImage = mimeType.startsWith("image/");

    if (!isPDF && !isImage) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
    }

    let raw = "";

    if (isImage) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      raw = await aiVision(base64, mimeType, RECEIPT_PROMPT, { temperature: 0.1, maxTokens: 1024 });
    } else {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text;

      if (!text || text.trim().length < 10) {
        return NextResponse.json({ error: "Could not extract text from PDF" }, { status: 400 });
      }

      raw = await aiChat([{
        role: "user",
        content: `${RECEIPT_PROMPT}\n\nReceipt text:\n${text.substring(0, 4000)}`,
      }], { temperature: 0.1, maxTokens: 1024 });
    }

    // Parse JSON
    const match = raw.replace(/^```json?\s*/im, "").replace(/\n?```\s*$/im, "").trim();
    const jsonMatch = match.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Could not parse receipt" }, { status: 422 });

    const data = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to parse receipt" }, { status: 500 });
  }
}
