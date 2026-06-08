import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";

/**
 * GeM Bid AI Analyzer — Deep-dives into tender documents using Groq AI.
 *
 * POST /api/gem-scraper/analyze
 * Body: { bid_id: string }
 */

const TENDER_ANALYSIS_PROMPT = `You are an expert Indian government procurement analyst.
You will be given the full text of a GeM (Government e-Marketplace) tender document.
Analyze it thoroughly — nothing should be missed. A business owner's bid submission depends on your accuracy.

Extract and return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 paragraph plain English summary of what this tender is about, key deliverables, timeline, and value. Write for a non-technical business owner.",
  "eligibility": {
    "eligible": true/false (based on general SME criteria — assume a small to medium enterprise),
    "confidence": 0-100,
    "reasons": ["reason1", "reason2"],
    "missing_docs": ["doc1", "doc2"],
    "missing_criteria": ["criteria1", "criteria2"]
  },
  "requirements": [
    {
      "category": "Technical" | "Financial" | "Documentation" | "Delivery" | "Penalty" | "Compliance",
      "title": "Short title",
      "description": "Full description of the requirement",
      "mandatory": true/false
    }
  ],
  "doc_checklist": [
    {
      "doc_name": "Document Name",
      "doc_type": "mandatory" | "optional" | "conditional",
      "description": "What this document should contain",
      "can_generate": true/false (true if this is a standard business letter, declaration, or compliance matrix that can be auto-generated),
      "notes": "Any special instructions"
    }
  ],
  "key_dates": {
    "bid_start": "YYYY-MM-DD or null",
    "bid_end": "YYYY-MM-DD or null",
    "emd_deadline": "YYYY-MM-DD or null",
    "delivery_date": "YYYY-MM-DD or null"
  },
  "financials": {
    "estimated_value": number or null,
    "emd_amount": number or null,
    "performance_security_percent": number or null
  },
  "evaluation_method": "L1 | QCBS | Technical-Only | Other",
  "risk_assessment": "Low | Medium | High — with 1-2 line explanation"
}

RULES:
- Extract EVERY requirement listed in the tender. Do not skip any.
- For doc_checklist, include ALL documents mentioned as required for submission.
- Mark can_generate=true for: Cover Letters, Undertakings, Self-Declarations, Compliance Matrices, Authorization Letters.
- Mark can_generate=false for: Registration Certificates, Financial Statements, OEM Authorizations, Test Reports.
- If any information is not available in the text, use null.
- Be conservative with eligibility assessment — flag concerns even if uncertain.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      return NextResponse.json({ error: "No business profile found" }, { status: 400 });
    }

    const body = await request.json();
    const { bid_id } = body;

    if (!bid_id) {
      return NextResponse.json({ error: "bid_id is required" }, { status: 400 });
    }

    // Fetch the bid
    const { data: bid, error: bidError } = await supabase
      .from("gem_bids")
      .select("*")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();

    if (bidError || !bid) {
      return NextResponse.json({ error: "Bid not found" }, { status: 404 });
    }

    // Mark as analyzing
    await supabase
      .from("gem_bids")
      .update({ status: "analyzing" })
      .eq("id", bid_id);

    // Fetch any tender documents for this bid
    const { data: documents } = await supabase
      .from("gem_bid_documents")
      .select("*")
      .eq("gem_bid_id", bid_id)
      .eq("is_generated", false);

    let tenderText = "";

    // Extract text from tender documents (PDFs)
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        try {
          // Download the file from Supabase Storage
          const { data: fileData } = await supabase.storage
            .from("gem-documents")
            .download(doc.file_url);

          if (fileData) {
            const buffer = Buffer.from(await fileData.arrayBuffer());

            // Parse PDF text
            if (typeof globalThis.DOMMatrix === "undefined") {
              const { DOMMatrix } = await import("@napi-rs/canvas");
              globalThis.DOMMatrix = DOMMatrix as any;
            }
            const { PDFParse } = await import("pdf-parse");
            const worker = await import("pdf-parse/worker");
            PDFParse.setWorker(worker.getData());
            const parser = new PDFParse({ data: buffer });
            const pdfData = await parser.getText();

            tenderText += `\n\n--- Document: ${doc.file_name} ---\n${pdfData.text}`;
          }
        } catch (docErr) {
          console.error(`Failed to parse document ${doc.file_name}:`, docErr);
        }
      }
    }

    // If no documents, use the raw HTML or bid metadata for analysis
    if (!tenderText.trim()) {
      tenderText = `
Bid Number: ${bid.gem_bid_id}
Title: ${bid.title}
Department: ${bid.department || "N/A"}
Organization: ${bid.organization || "N/A"}
Category: ${bid.category || "N/A"}
Quantity: ${bid.quantity || "N/A"} ${bid.uom || ""}
Estimated Value: ₹${bid.estimated_value || "N/A"}
Start Date: ${bid.start_date || "N/A"}
End Date: ${bid.end_date || "N/A"}
Bid Type: ${bid.bid_type || "N/A"}

${bid.raw_html ? `\nAdditional tender details from page:\n${stripHtml(bid.raw_html).substring(0, 15000)}` : ""}
      `.trim();
    }

    // Fetch business profile for cross-referencing
    const { data: business } = await supabase
      .from("businesses")
      .select("name, gstin, pan, address, phone, email")
      .eq("id", userData.business_id)
      .single();

    // Fetch recent completed purchase orders for experience assessment
    const { data: recentPOs } = await supabase
      .from("purchase_invoices")
      .select("bill_number, bill_date, total, supplier_name")
      .eq("business_id", userData.business_id)
      .eq("status", "paid")
      .order("bill_date", { ascending: false })
      .limit(10);

    const businessContext = business
      ? `\n\n--- Our Company Profile ---
Company: ${business.name}
GSTIN: ${business.gstin || "Not registered"}
PAN: ${business.pan || "Not available"}
Address: ${business.address || "Not available"}
Recent Completed Orders: ${recentPOs?.length || 0} (Total value: ₹${recentPOs?.reduce((s: number, p: any) => s + p.total, 0)?.toLocaleString("en-IN") || "0"})`
      : "";

    // Send to AI for deep analysis
    const rawResult = await aiChat(
      [
        {
          role: "user",
          content: `${TENDER_ANALYSIS_PROMPT}\n\n--- TENDER DOCUMENT TEXT ---\n${tenderText.substring(0, 25000)}${businessContext}`,
        },
      ],
      {
        tier: "enhanced",
        temperature: 0.15,
        maxTokens: 4096,
      }
    );

    // Parse AI response
    const analysis = parseJSON(rawResult);

    if (!analysis) {
      await supabase
        .from("gem_bids")
        .update({ status: "new" })
        .eq("id", bid_id);

      return NextResponse.json(
        { error: "AI analysis failed to parse. Try again." },
        { status: 422 }
      );
    }

    // Update bid with analysis results
    await supabase
      .from("gem_bids")
      .update({
        status: "analyzed",
        ai_summary: analysis.summary || null,
        ai_eligibility: analysis.eligibility || null,
        ai_requirements: analysis.requirements || null,
        ai_doc_checklist: analysis.doc_checklist || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bid_id);

    // Store individual document analyses
    if (documents && documents.length > 0) {
      for (const doc of documents) {
        const docAnalysis = analysis.requirements
          ?.filter((r: any) => r.category === "Documentation")
          .map((r: any) => `• ${r.title}: ${r.description}`)
          .join("\n");

        if (docAnalysis) {
          await supabase
            .from("gem_bid_documents")
            .update({ ai_analysis: docAnalysis })
            .eq("id", doc.id);
        }
      }
    }

    return NextResponse.json({
      bid_id,
      summary: analysis.summary,
      eligibility: analysis.eligibility,
      requirements: analysis.requirements,
      doc_checklist: analysis.doc_checklist,
      key_dates: analysis.key_dates,
      financials: analysis.financials,
      evaluation_method: analysis.evaluation_method,
      risk_assessment: analysis.risk_assessment,
    });
  } catch (error: any) {
    console.error("GeM analyze error:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    );
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
