import { NextRequest, NextResponse } from "next/server";
import { aiVision, aiChat } from "@/lib/ai-client";

// Max file size: 10MB
const MAX_SIZE = 10 * 1024 * 1024;

const PURCHASE_EXTRACTION_PROMPT = `You are an expert at reading Indian purchase invoices, bills, and receipts.
Extract all information from this invoice image/document.

Return ONLY valid JSON with this exact structure:
{
  "supplier_name": "Vendor/Supplier company name",
  "supplier_gstin": "Supplier GSTIN if visible (15 char)",
  "bill_number": "Invoice/Bill number",
  "bill_date": "YYYY-MM-DD format",
  "due_date": "YYYY-MM-DD format or null",
  "items": [
    {
      "description": "Full item name with all specs (size, grade, material)",
      "hsn_code": "HSN/SAC code if visible or null",
      "quantity": number,
      "unit": "kg/pcs/ton/mtr/box/etc",
      "rate": number (per unit price EXCLUDING GST),
      "gst_rate": 0/5/12/18/28 (GST percentage)
    }
  ],
  "subtotal": number (taxable value, before GST),
  "cgst": number or 0,
  "sgst": number or 0,
  "igst": number or 0,
  "total": number (final amount),
  "notes": "any important notes, payment terms, etc or null"
}

RULES:
- Extract ALL line items, even if many
- rate = price per unit EXCLUDING GST
- If only total with GST is shown, back-calculate: subtotal = total / (1 + gst%/100)
- HSN codes: steel/metal = 72xx-73xx, electrical = 85xx, hardware = 82xx-83xx
- Common Indian GST rates: 5%, 12%, 18%, 28% - pick the closest
- For items without clear GST, default to 18%
- bill_date and due_date must be YYYY-MM-DD format
- If a field is not visible, use null
- NEVER make up data - only extract what is clearly visible`;

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
      const raw = await aiVision(base64, mimeType, PURCHASE_EXTRACTION_PROMPT, {
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
        content: `${PURCHASE_EXTRACTION_PROMPT}\n\nInvoice text:\n${text.substring(0, 8000)}`,
      }], { temperature: 0.1, maxTokens: 4096 });

      extractedData = parseJSON(raw);
    }

    if (!extractedData) {
      return NextResponse.json(
        { error: "Could not parse invoice data. Please fill in manually." },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: extractedData });
  } catch (error: any) {
    console.error("Parse purchase image error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse invoice" },
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
