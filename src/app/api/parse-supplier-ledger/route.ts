import { NextRequest, NextResponse } from "next/server";
import { aiVision, aiChat } from "@/lib/ai-client";

// Max file size: 10MB
const MAX_SIZE = 10 * 1024 * 1024;

const LEDGER_EXTRACTION_PROMPT = `You are an expert financial accountant.
Analyze this ledger statement (which lists transactions between a supplier/client and us).
Extract the opening balance, closing balance, and all listed transactions chronologically.

IMPORTANT RULE ON PERSPECTIVE:
A statement from a supplier or client is written from THEIR perspective:
1. IN SUPPLIER STATEMENT:
   - Invoices/Charges they billed us are DEBITS (increases what we owe them).
   - Payments we made to them are CREDITS (decreases what we owe them).
2. IN CLIENT/CUSTOMER STATEMENT:
   - Invoices/Charges we billed them are DEBITS (increases what they owe us).
   - Payments they made to us are CREDITS (decreases what they owe us).

For each transaction, extract:
- "date": "YYYY-MM-DD" (or format as closely as possible to YYYY-MM-DD)
- "reference": "Invoice number, receipt number, check number, or transaction ID (e.g. INV-100, REC-200, TXN-999, etc.)"
- "description": "Transaction description (e.g. Sale, Payment, Receipt, Bank Transfer, opening balance)"
- "type": "invoice" | "payment" | "other" (classify carefully)
- "amount": number (positive absolute value)

Return ONLY valid JSON with this exact structure:
{
  "opening_balance": number or null,
  "closing_balance": number or null,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "reference": "string",
      "description": "string",
      "type": "invoice" | "payment" | "other",
      "amount": number
    }
  ]
}

RULES:
- Extract all line items chronologically.
- Date must be in YYYY-MM-DD format.
- If a field is not visible, use null.
- NEVER make up data.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const mimeType = file.type;
    const isPDF = mimeType === "application/pdf";
    const isImage = mimeType.startsWith("image/");

    if (!isPDF && !isImage) {
      return NextResponse.json(
        { error: "Unsupported file type. Please upload an image or PDF." },
        { status: 400 }
      );
    }

    let extractedData: any;

    if (isImage) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const raw = await aiVision(base64, mimeType, LEDGER_EXTRACTION_PROMPT, {
        temperature: 0.1,
        maxTokens: 4096,
      });
      extractedData = parseJSON(raw);
    } else {
      // PDF: extract text then use LLM
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (typeof globalThis.DOMMatrix === "undefined") {
        const { DOMMatrix } = await import("@napi-rs/canvas");
        globalThis.DOMMatrix = DOMMatrix as any;
      }
      const { PDFParse } = await import("pdf-parse");
      const worker = await import("pdf-parse/worker");
      PDFParse.setWorker(worker.getData());
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      const text = pdfData.text;

      if (!text || text.trim().length < 20) {
        return NextResponse.json(
          { error: "Could not extract text from PDF. Try uploading a clearer scan." },
          { status: 400 }
        );
      }

      const raw = await aiChat([{
        role: "user",
        content: `${LEDGER_EXTRACTION_PROMPT}\n\nStatement text:\n${text.substring(0, 12000)}`,
      }], { temperature: 0.1, maxTokens: 4096 });

      extractedData = parseJSON(raw);
    }

    if (!extractedData) {
      return NextResponse.json(
        { error: "Could not parse statement data. Please review the file format." },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: extractedData });
  } catch (error: any) {
    console.error("Parse statement error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse statement" },
      { status: 500 }
    );
  }
}

function parseJSON(raw: string): any {
  try {
    // Strip markdown code fences
    let text = raw
      .replace(/^```json?\s*\n?/im, "")
      .replace(/\n?```\s*$/im, "")
      .trim();

    // Extract JSON object if embedded in text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) text = match[0];

    return JSON.parse(text);
  } catch {
    return null;
  }
}
