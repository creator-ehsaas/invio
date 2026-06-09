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
Analyze the GeM (Government e-Marketplace) tender document thoroughly. A business owner's bid depends on your accuracy.

Return ONLY valid JSON. CRITICAL RULE: All string values must be single-line — use a space instead of a newline. Do NOT include literal newline characters inside any string value.

{
  "summary": "2-3 sentence plain-text executive overview of this tender. What is being purchased, from whom, estimated value, and closing date.",
  "sections": {
    "overview": "Single paragraph: what is being procured, the buyer department, purpose, and scope.",
    "items_and_specs": "Single paragraph: exact items or services, quantities, units, technical specifications, brand or make requirements, quality standards, certifications required for the product.",
    "financial_details": "Single paragraph: estimated/budget value in rupees, EMD amount, performance security percentage, payment terms (advance, on delivery, milestone), price variation clause if any.",
    "delivery_and_logistics": "Single paragraph: delivery location(s), delivery period in days/weeks from order, installation or commissioning requirements, FOB/CIF terms, packing requirements.",
    "eligibility_criteria": "Single paragraph: minimum annual turnover, years of experience, MSME/OEM/NSIC registration requirements, prior supply experience requirements, financial criteria.",
    "terms_and_conditions": "Single paragraph: warranty period, AMC requirements, after-sales service obligations, penalties for delay (LD clause), inspection and testing requirements, rejection policy.",
    "key_risks": "Single paragraph: any tight deadlines, strict penalty clauses, unusual technical requirements, high EMD, short delivery period, or anything that makes this bid risky or challenging."
  },
  "eligibility": {
    "eligible": true,
    "confidence": 75,
    "reasons": ["reason 1", "reason 2"],
    "missing_docs": ["missing doc 1"],
    "missing_criteria": ["missing criteria 1"]
  },
  "requirements": [
    {
      "category": "Technical",
      "title": "Short title",
      "description": "Full description on one line",
      "mandatory": true
    }
  ],
  "doc_checklist": [
    {
      "doc_name": "Document Name",
      "doc_type": "mandatory",
      "description": "What this document should contain, on one line",
      "can_generate": true,
      "notes": "Special instructions if any"
    }
  ],
  "key_dates": {
    "bid_start": "YYYY-MM-DD",
    "bid_end": "YYYY-MM-DD",
    "delivery_date": "YYYY-MM-DD or null"
  },
  "financials": {
    "estimated_value": 500000,
    "emd_amount": 10000,
    "performance_security_percent": 3
  },
  "evaluation_method": "L1",
  "risk_assessment": "Low - standard procurement with clear specifications and reasonable timeline."
}

RULES:
- category must be exactly one of: Technical, Financial, Documentation, Delivery, Penalty, Compliance
- doc_type must be exactly one of: mandatory, optional, conditional
- evaluation_method must be exactly one of: L1, QCBS, Technical-Only, Other
- Extract ALL requirements — do not skip any.
- Include ALL documents required for submission in doc_checklist.
- can_generate=true for: Cover Letters, Undertakings, Self-Declarations, Compliance Matrices, Authorization Letters.
- can_generate=false for: Registration Certificates, Financial Statements, OEM Authorizations, Test Reports.
- Use null for unavailable information (not "N/A" or empty string in numeric fields).
- NEVER put a literal newline inside any string value.`;

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
            try {
              // eslint-disable-next-line @typescript-eslint/no-require-imports
              const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
              const pdfData = await pdfParse(buffer);
              tenderText += `\n\n--- Document: ${doc.file_name} ---\n${pdfData.text}`;
            } catch (pdfErr) {
              console.error(`PDF parse error for ${doc.file_name}:`, pdfErr);
            }
          }
        } catch (docErr) {
          console.error(`Failed to parse document ${doc.file_name}:`, docErr);
        }
      }
    }

    // If no documents, use the fetched full text or bid metadata for analysis
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
      `.trim();

      if (bid.raw_full_text) {
        tenderText += `\n\n--- Fetched Tender Content ---\n${bid.raw_full_text.substring(0, 20000)}`;
      }
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

    // Store summary + detailed sections as JSON in ai_summary field
    const summaryPayload = JSON.stringify({
      summary: analysis.summary || "",
      sections: analysis.sections || {},
    });

    // Update estimated_value / emd if AI found them and DB doesn't have them
    const financialUpdates: Record<string, any> = {};
    if (analysis.financials?.estimated_value && !bid.estimated_value) {
      financialUpdates.estimated_value = analysis.financials.estimated_value;
    }
    if (analysis.financials?.emd_amount) {
      financialUpdates.ai_emd_amount = analysis.financials.emd_amount;
    }

    await supabase
      .from("gem_bids")
      .update({
        status: "analyzed",
        ai_summary: summaryPayload,
        ai_eligibility: analysis.eligibility || null,
        ai_requirements: analysis.requirements || null,
        ai_doc_checklist: analysis.doc_checklist || null,
        ai_risk_assessment: analysis.risk_assessment || null,
        ai_evaluation_method: analysis.evaluation_method || null,
        ai_delivery_date: analysis.key_dates?.delivery_date || null,
        ...financialUpdates,
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

// Repair literal newlines/tabs that AI puts inside JSON string values
function repairJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (escape) { out += c; escape = false; continue; }
    if (c === "\\") { escape = true; out += c; continue; }
    if (c === '"') { inString = !inString; out += c; continue; }
    if (inString) {
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
    }
    out += c;
  }
  return out;
}

function parseJSON(raw: string): any {
  let text = raw
    .replace(/^```json?\s*\n?/im, "")
    .replace(/\n?```\s*$/im, "")
    .trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (match) text = match[0];

  try { return JSON.parse(text); } catch {}

  // Retry after repairing unescaped control chars in string values
  try { return JSON.parse(repairJsonStrings(text)); } catch {}

  return null;
}
