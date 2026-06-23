import { NextRequest, NextResponse } from "next/server";
import { aiVision, aiChat } from "@/lib/ai-client";

const MAX_SIZE = 10 * 1024 * 1024;

const PURCHASE_EXTRACTION_PROMPT = `You are an expert at reading Indian purchase invoices, bills, and receipts.
Extract all information from this invoice document.

CRITICAL DISTINCTION - READ THIS CAREFULLY:
- The SUPPLIER (seller/vendor) is the company that ISSUED this invoice: appears in the letterhead, top header, "From:", "Sold By:", "Vendor Details:", or the main company branding at the top of the document
- YOUR COMPANY (the buyer) appears in the "Bill To:", "Ship To:", "Sold To:", "Buyer Details:" section — DO NOT use this as the supplier_name
- When in doubt: the supplier is at the TOP of the invoice issuing it; the buyer is in the "Bill To" box

Return ONLY valid JSON with this exact structure:
{
  "supplier_name": "Name of the company that ISSUED this invoice (letterhead/top/From section) — NOT the Bill To name",
  "supplier_gstin": "Supplier GSTIN if visible (15 char) — from the issuer section, NOT Bill To",
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
- supplier_name = the company in the LETTERHEAD/HEADER that sent you this bill — NEVER the "Bill To" company
- Extract ALL line items, even if many
- rate = price per unit EXCLUDING GST
- If only total with GST is shown, back-calculate: subtotal = total / (1 + gst%/100)
- HSN codes: steel/metal = 72xx-73xx, electrical = 85xx, hardware = 82xx-83xx
- Common Indian GST rates: 5%, 12%, 18%, 28% - pick the closest
- For items without clear GST, default to 18%
- bill_date and due_date must be YYYY-MM-DD format
- If a field is not visible, use null
- NEVER make up data - only extract what is clearly visible`;

const VERIFY_PURCHASE_PROMPT = (supplierName: string, billNumber: string) =>
  `You previously extracted a purchase invoice and identified:
- Supplier Name: "${supplierName}"
- Bill Number: "${billNumber}"

VERIFY these two fields:
1. supplier_name must be the company that ISSUED the invoice (top header / letterhead / "From" section). If it looks like a buyer name from "Bill To" / "Ship To", correct it.
2. bill_number must be an actual invoice/bill number (e.g. "INV-001", "2024-25/1234"). If it looks like a date or amount, correct it.

Return ONLY valid JSON:
{
  "supplier_name": "verified or corrected supplier name",
  "bill_number": "verified or corrected bill number"
}`;

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
    const isDocx =
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.toLowerCase().endsWith(".docx");

    if (!isPDF && !isImage && !isDocx) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a PDF, image, or DOCX." },
        { status: 400 }
      );
    }

    let extractedData: any;
    // Keep text/base64 available for the verification pass
    let verifyContext: { type: "image"; base64: string; mimeType: string } | { type: "text"; text: string } | null = null;

    if (isImage) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      verifyContext = { type: "image", base64, mimeType };
      const raw = await aiVision(base64, mimeType, PURCHASE_EXTRACTION_PROMPT, {
        temperature: 0.1,
        maxTokens: 4096,
      });
      extractedData = parseJSON(raw);
    } else if (isPDF) {
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

      verifyContext = { type: "text", text };
      const raw = await aiChat(
        [{ role: "user", content: `${PURCHASE_EXTRACTION_PROMPT}\n\nInvoice text:\n${text.substring(0, 8000)}` }],
        { temperature: 0.1, maxTokens: 4096 }
      );
      extractedData = parseJSON(raw);
    } else {
      // DOCX
      const bytes = await file.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      const text = result.value;

      if (!text || text.trim().length < 20) {
        return NextResponse.json(
          { error: "Could not extract text from DOCX file." },
          { status: 400 }
        );
      }

      verifyContext = { type: "text", text };
      const raw = await aiChat(
        [{ role: "user", content: `${PURCHASE_EXTRACTION_PROMPT}\n\nInvoice text:\n${text.substring(0, 8000)}` }],
        { temperature: 0.1, maxTokens: 4096 }
      );
      extractedData = parseJSON(raw);
    }

    if (!extractedData) {
      return NextResponse.json(
        { error: "Could not parse invoice data. Please fill in manually." },
        { status: 422 }
      );
    }

    // ── Second pass: verification only for images (text files have structured extraction) ──
    if (verifyContext && verifyContext.type === "image" && extractedData.supplier_name) {
      try {
        const verifyPrompt = VERIFY_PURCHASE_PROMPT(
          extractedData.supplier_name,
          extractedData.bill_number ?? ""
        );
        const verifyRaw = await aiVision(verifyContext.base64, verifyContext.mimeType, verifyPrompt, {
          temperature: 0.1,
          maxTokens: 256,
        });
        const verified = parseJSON(verifyRaw);
        if (verified?.supplier_name) extractedData.supplier_name = verified.supplier_name;
        if (verified?.bill_number) {
          extractedData.bill_number = verified.bill_number;
        }
      } catch {
        // Verification pass failure is non-fatal — use first-pass result
      }
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
    let text = raw
      .replace(/^```json?\s*\n?/im, "")
      .replace(/\n?```\s*$/im, "")
      .trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match) text = match[0];
    return JSON.parse(text);
  } catch {
    return null;
  }
}
