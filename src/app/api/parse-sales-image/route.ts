import { NextRequest, NextResponse } from "next/server";
import { aiVision, aiChat } from "@/lib/ai-client";

const MAX_SIZE = 10 * 1024 * 1024;

const SALES_EXTRACTION_PROMPT = `You are an expert at reading Indian sales invoices issued by businesses to their customers.
Extract all information from this invoice document.

CRITICAL DISTINCTION:
- The CUSTOMER (buyer) is the company in the "Bill To:", "Ship To:", "Sold To:", or "Buyer Details:" section
- YOUR COMPANY (the seller/issuer) is in the letterhead, top header, or "From:" section — DO NOT use this as the customer_name
- When in doubt: the customer is in the "Bill To" box; the seller is in the letterhead

Return ONLY valid JSON with this exact structure:
{
  "customer_name": "Name of the BUYER from 'Bill To' / 'Sold To' section — NOT the issuing company",
  "customer_gstin": "Buyer GSTIN from 'Bill To' section if visible (15 char)",
  "invoice_number": "Invoice number",
  "invoice_date": "YYYY-MM-DD format",
  "due_date": "YYYY-MM-DD format or null",
  "items": [
    {
      "description": "Full item/service name with all specs",
      "hsn_code": "HSN/SAC code if visible or null",
      "quantity": number,
      "unit": "kg/pcs/ton/mtr/box/hrs/etc",
      "rate": number (per unit price EXCLUDING GST),
      "gst_rate": 0/5/12/18/28 (GST percentage)
    }
  ],
  "subtotal": number (taxable value, before GST),
  "cgst": number or 0,
  "sgst": number or 0,
  "igst": number or 0,
  "total": number (final amount),
  "notes": "payment terms, PO reference, or other notes — or null"
}

RULES:
- customer_name = the BUYER in the "Bill To" section — NEVER the issuing company name
- Extract ALL line items
- rate = price per unit EXCLUDING GST
- If only total with GST shown, back-calculate: subtotal = total / (1 + gst%/100)
- Common Indian GST rates: 5%, 12%, 18%, 28% — pick the closest
- For items without clear GST, default to 18%
- All dates in YYYY-MM-DD format
- If a field is not visible, use null
- NEVER make up data — only extract what is clearly visible`;

const VERIFY_SALES_PROMPT = (customerName: string, invoiceNumber: string) =>
  `You previously extracted a sales invoice and identified:
- Customer Name: "${customerName}"
- Invoice Number: "${invoiceNumber}"

VERIFY these two fields:
1. customer_name must be the BUYER from the "Bill To" / "Sold To" section. If it looks like the issuing company from the letterhead/header, correct it to the actual buyer.
2. invoice_number must be an actual invoice number (e.g. "INV-001", "2024-25/1234"). If it looks like a date or reference number, correct it.

Return ONLY valid JSON:
{
  "customer_name": "verified or corrected customer name",
  "invoice_number": "verified or corrected invoice number"
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
    let verifyContext: { type: "image"; base64: string; mimeType: string } | { type: "text"; text: string } | null = null;

    if (isImage) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      verifyContext = { type: "image", base64, mimeType };
      const raw = await aiVision(base64, mimeType, SALES_EXTRACTION_PROMPT, {
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
        [{ role: "user", content: `${SALES_EXTRACTION_PROMPT}\n\nInvoice text:\n${text.substring(0, 8000)}` }],
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
        [{ role: "user", content: `${SALES_EXTRACTION_PROMPT}\n\nInvoice text:\n${text.substring(0, 8000)}` }],
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

    // ── Second pass: targeted verification of customer name + invoice number ──
    if (verifyContext && extractedData.customer_name) {
      try {
        let verifyRaw: string;
        const verifyPrompt = VERIFY_SALES_PROMPT(
          extractedData.customer_name,
          extractedData.invoice_number ?? ""
        );
        if (verifyContext.type === "image") {
          verifyRaw = await aiVision(verifyContext.base64, verifyContext.mimeType, verifyPrompt, {
            temperature: 0.1,
            maxTokens: 256,
          });
        } else {
          verifyRaw = await aiChat(
            [{ role: "user", content: `${verifyPrompt}\n\nInvoice text:\n${verifyContext.text.substring(0, 4000)}` }],
            { temperature: 0.1, maxTokens: 256 }
          );
        }
        const verified = parseJSON(verifyRaw);
        if (verified?.customer_name) {
          extractedData.customer_name = verified.customer_name;
        }
        if (verified?.invoice_number) {
          extractedData.invoice_number = verified.invoice_number;
        }
      } catch {
        // Verification pass failure is non-fatal — use first-pass result
      }
    }

    return NextResponse.json({ data: extractedData });
  } catch (error: any) {
    console.error("Parse sales image error:", error);
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
