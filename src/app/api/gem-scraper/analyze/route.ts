import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";
import { extractPdfText } from "@/lib/pdf-text";
import { buildTenderContext } from "@/lib/tender-context";

/**
 * GeM Bid AI Analyzer — Deep-dives into tender documents using Groq AI.
 *
 * POST /api/gem-scraper/analyze
 * Body: { bid_id: string }
 */

const TENDER_ANALYSIS_PROMPT = `You are an expert Indian government procurement analyst specializing in GeM (Government e-Marketplace) tenders.
Analyze the tender document THOROUGHLY. Extract EVERY specification detail. A business owner's bid success depends on your accuracy.

IMPORTANT: The tender may include SPECIFICATION DOCUMENTS (marked with === SPECIFICATION: ===). These contain CRITICAL technical details that MUST be extracted. Pay special attention to:
- Item descriptions, makes, models, part numbers
- Technical parameters (dimensions, capacity, power, materials)
- Quality standards (BIS, ISO, NABL certifications)
- Testing requirements and acceptance criteria
- Brand/make restrictions or equivalents allowed

Return ONLY valid JSON. CRITICAL: All string values must be single-line — use a space instead of newlines. Do NOT include literal newline characters inside any string value.

{
  "summary": "2-3 sentence executive overview: what is being purchased, buyer, estimated value, key specs, and deadline.",
  "sections": {
    "overview": "Detailed paragraph: what is being procured, buyer department, organization, purpose, project context if mentioned, and overall scope.",
    "items_and_specs": "DETAILED paragraph: exact items/services with quantities and units. Include ALL technical specifications: dimensions, capacity, power ratings, materials, colors, grades, makes/models allowed, part numbers, BIS/ISO standards required, testing certifications. This is the MOST IMPORTANT section - extract every specification detail from both the main document AND the specification PDFs.",
    "financial_details": "Paragraph: estimated/budget value (exact figure in rupees), EMD amount and type (percentage or fixed), performance security percentage, payment terms (advance percentage, milestone payments, on delivery), price variation clause, GST treatment.",
    "delivery_and_logistics": "Paragraph: ALL delivery locations with complete addresses, delivery period in days/weeks from PO date, installation/commissioning requirements, training requirements, FOB/FOR/CIF terms, packing specifications, transportation responsibility.",
    "eligibility_criteria": "Paragraph: minimum annual turnover (last 3 years), years of business experience required, MSME/Startup/OEM/NSIC registration requirements, prior supply experience (quantity and value), similar order completion certificates needed, geographical restrictions, technical capability requirements.",
    "terms_and_conditions": "Paragraph: warranty period and scope, AMC terms if any, after-sales service obligations, spare parts availability, penalties for delay (LD clause with percentage and cap), inspection procedure, testing at site, rejection and replacement policy, dispute resolution.",
    "key_risks": "Paragraph: identify ALL risks - tight deadlines, high EMD, strict LD clauses, unusual specs, single-brand requirement, complex technical requirements, remote delivery locations, short delivery period, high penalty caps, unclear specifications."
  },
  "eligibility": {
    "eligible": true,
    "confidence": 75,
    "reasons": ["Concrete reasons comparing THIS tender's stated criteria against OUR COMPANY PROFILE, quoting actual figures"],
    "missing_docs": ["Exact document names THIS tender demands that the company profile shows no evidence of having; [] if none"],
    "missing_criteria": ["Specific failed criteria WITH NUMBERS, e.g. 'Tender requires ₹50 lakh average annual turnover; company profile shows ₹12 lakh'; [] if none"]
  },
  "requirements": [
    {
      "category": "Technical",
      "title": "Short descriptive title",
      "description": "Complete requirement with all details - specs, standards, certifications mentioned",
      "mandatory": true
    }
  ],
  "doc_checklist": [
    {
      "doc_name": "Exact Document Name as mentioned in tender",
      "doc_type": "mandatory",
      "description": "What this document should contain, format requirements",
      "can_generate": true,
      "notes": "Any special instructions - notarization, attestation, format"
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
    "performance_security_percent": 3,
    "payment_terms": "Payment terms summary"
  },
  "item_details": [
    {
      "item_name": "Item or service name",
      "quantity": 100,
      "unit": "Nos/Kg/Ltr/Set",
      "specifications": "All technical specs for this item",
      "make_model": "Allowed makes/models or 'Any' if not specified",
      "unit_price_estimate": null
    }
  ],
  "evaluation_method": "L1",
  "risk_assessment": "Risk level (Low/Medium/High) with specific reasons based on the tender requirements."
}

RULES:
- category must be exactly one of: Technical, Financial, Documentation, Delivery, Penalty, Compliance
- doc_type must be exactly one of: mandatory, optional, conditional
- evaluation_method must be exactly one of: L1, QCBS, Technical-Only, Other
- Extract ALL requirements from BOTH main tender AND specification documents — do not skip any
- Extract ALL items with their individual specifications in item_details array
- Include ALL documents required for submission in doc_checklist
- can_generate=true for: Cover Letters, Undertakings, Self-Declarations, Compliance Matrices, Authorization Letters, Technical Compliance Statements
- can_generate=false for: Registration Certificates, Financial Statements, OEM Authorizations, Test Reports, Experience Certificates from third parties, Bank Guarantees
- Use null for unavailable information (not "N/A" or empty string in numeric fields)
- NEVER put a literal newline inside any string value
- For items_and_specs: BE EXHAUSTIVE - this section should capture every technical detail that a bidder needs to know

CRITICAL — NO FABRICATION:
- financials.estimated_value: extract ONLY a figure explicitly stated in the tender text. If the tender does not state it, use null. NEVER estimate, compute, derive, or guess it — a fabricated figure leads to a wrong bid and changes between runs.
- financials.emd_amount and performance_security_percent: same rule — stated figure or null.
- key_dates: use only dates printed in the document; never infer.
- unit_price_estimate in item_details: null unless a unit rate is printed in the document.
- For any section where the document genuinely contains no information, write exactly "Not specified in the tender document." — do not pad with generic assumptions.

ELIGIBILITY MUST BE SPECIFIC:
- Compare the tender's stated eligibility criteria against the OUR COMPANY PROFILE section provided after the tender text. Every reason, missing document, and missing criterion must name something concrete from THIS tender (a document name, a turnover figure, a certification, an experience requirement).
- If the tender states no restrictive eligibility criteria, set eligible=true, and reasons to ["No restrictive eligibility criteria stated in the tender"].
- NEVER output generic placeholder text such as "Specific documents required for the tender" or "Specific criteria that may disqualify". If you have nothing concrete to list, return an empty array [].`;

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

    // Remember the pre-analysis status so a failure never strands the bid
    // in "analyzing" or clobbers a user-set status like "shortlisted".
    const prevStatus = bid.status === "analyzing" ? "new" : bid.status;

    // Mark as analyzing
    await supabase
      .from("gem_bids")
      .update({ status: "analyzing" })
      .eq("id", bid_id);

    try {

    // Fetch any tender documents for this bid
    const { data: documents } = await supabase
      .from("gem_bid_documents")
      .select("*")
      .eq("gem_bid_id", bid_id)
      .eq("is_generated", false);

    // Always start from bid metadata, then layer in the fetched tender
    // content (which already includes extracted spec PDF text) and any
    // storage-hosted tender PDFs.
    let tenderText = `
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
      // Full stored text — buildTenderContext dedupes and budgets it below
      tenderText += `\n\n--- Fetched Tender Content (includes specification documents) ---\n${bid.raw_full_text}`;
    }

    // External tender links (https://...) can't be downloaded from storage —
    // their text is already in raw_full_text. Only parse storage-hosted PDFs.
    const storageDocs = (documents || []).filter((d) => !d.file_url.startsWith("http"));
    for (const doc of storageDocs) {
      try {
        const { data: fileData } = await supabase.storage
          .from("gem-documents")
          .download(doc.file_url);

        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer());
          const docText = await extractPdfText(buffer);
          if (docText?.trim()) {
            tenderText += `\n\n=== UPLOADED DOCUMENT: ${doc.file_name} ===\n${docText.substring(0, 15000)}`;
          }
        }
      } catch (docErr) {
        console.error(`Failed to parse document ${doc.file_name}:`, docErr);
      }
    }

    // Fetch business + GeM capability profile for the eligibility comparison
    const [{ data: business }, { data: gemProfile }, { data: recentSales }] = await Promise.all([
      supabase
        .from("businesses")
        .select("name, gstin, pan, address, phone, email")
        .eq("id", userData.business_id)
        .single(),
      supabase
        .from("gem_business_profile")
        .select("*")
        .eq("business_id", userData.business_id)
        .maybeSingle(),
      supabase
        .from("invoices")
        .select("total")
        .eq("business_id", userData.business_id)
        .in("status", ["paid", "sent"])
        .order("invoice_date", { ascending: false })
        .limit(20),
    ]);

    const turnovers = [gemProfile?.turnover_fy1, gemProfile?.turnover_fy2, gemProfile?.turnover_fy3]
      .filter((t: any) => t != null)
      .map((t: any) => `₹${Number(t).toLocaleString("en-IN")}`);

    const businessContext = business
      ? `\n\n--- OUR COMPANY PROFILE (compare eligibility against this) ---
Company: ${business.name}
GSTIN: ${business.gstin || "Not registered"}
PAN: ${business.pan || "Not available"}
Address: ${business.address || "Not available"}
MSME Category: ${gemProfile?.msme_category || "Not registered as MSME"}
Udyam Number: ${gemProfile?.udyam_number || "Not available"}
Years in Business: ${gemProfile?.years_in_business ?? "Unknown"}
Annual Turnover (last 3 FY): ${turnovers.length ? turnovers.join(", ") : "Not recorded"}
Certifications: ${gemProfile?.certifications?.length ? gemProfile.certifications.join(", ") : "None recorded"}
GeM Seller Registered: ${gemProfile?.gem_seller_registered ? `Yes (${gemProfile.gem_seller_id || "ID not recorded"})` : "Not recorded"}
Known Eligibility Gaps: ${gemProfile?.ai_eligibility_gaps?.length ? gemProfile.ai_eligibility_gaps.join("; ") : "None recorded"}
Completed Sales Orders: ${recentSales?.length || 0} recent (Total value: ₹${recentSales?.reduce((s: number, p: any) => s + (p.total || 0), 0)?.toLocaleString("en-IN") || "0"})`
      : "";

    // Deduped, priority-ordered context — keeps every document represented
    // while spending roughly half the tokens of naive truncation.
    const FULL_OUTPUT_TOKENS = 8000;
    const buildPrompt = (contextBudget: number) =>
      `${TENDER_ANALYSIS_PROMPT}\n\n--- TENDER DOCUMENT TEXT ---\n${buildTenderContext(tenderText, contextBudget)}${businessContext}`;
    const runAnalysis = (prompt: string, maxTokens: number) =>
      aiChat([{ role: "user", content: prompt }], {
        tier: "enhanced",
        // Extraction must be reproducible: same tender → same analysis
        temperature: 0,
        seed: 42,
        jsonMode: true,
        maxTokens,
      });

    let rawResult: string;
    const fullPrompt = buildPrompt(48000);
    try {
      rawResult = await runAnalysis(fullPrompt, FULL_OUTPUT_TOKENS);
    } catch (err: any) {
      // Free-tier provider plans enforce a per-minute token ceiling that
      // counts prompt + max output tokens. The rejection message reports
      // both the limit and what we requested — use that to calibrate the
      // real chars-per-token of THIS tender (Hindi text tokenizes much
      // denser than English) and refit the request to the caller's tier.
      const fit = /Limit (\d+), Requested (\d+)/.exec(err?.message || "");
      if ((err?.status !== 413 && err?.status !== 429) || !fit) throw err;
      const limit = parseInt(fit[1], 10);
      const requested = parseInt(fit[2], 10);

      const inputTokens = Math.max(1, requested - FULL_OUTPUT_TOKENS);
      const charsPerToken = fullPrompt.length / inputTokens;
      const outputTokens = Math.min(5000, Math.floor(limit / 3));
      const allowedPromptChars = Math.floor((limit * 0.92 - outputTokens) * charsPerToken);
      const contextBudget = allowedPromptChars - buildPrompt(0).length;
      if (contextBudget < 3000) {
        throw new Error(
          "This tender is too large for your current AI usage limit. Try again in a minute."
        );
      }
      rawResult = await runAnalysis(buildPrompt(contextBudget), outputTokens);
    }

    // Parse AI response
    const analysis = parseJSON(rawResult);

    if (!analysis) {
      await supabase
        .from("gem_bids")
        .update({ status: prevStatus })
        .eq("id", bid_id);

      return NextResponse.json(
        { error: "AI analysis failed to parse. Try again." },
        { status: 422 }
      );
    }

    // Strip placeholder echoes — generic schema-example strings must never
    // reach the UI; an empty array renders better than fake specificity.
    const PLACEHOLDER_RE = /^(specific|generic|typical|example|placeholder|clear reason|reason \d|criterion|document that|criteria that)/i;
    const cleanList = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? arr.filter((s): s is string => typeof s === "string" && !!s.trim() && !PLACEHOLDER_RE.test(s.trim()))
        : [];
    if (analysis.eligibility) {
      analysis.eligibility.reasons = cleanList(analysis.eligibility.reasons);
      analysis.eligibility.missing_docs = cleanList(analysis.eligibility.missing_docs);
      analysis.eligibility.missing_criteria = cleanList(analysis.eligibility.missing_criteria);
    }

    // Store summary + detailed sections + item details as JSON in ai_summary field
    const summaryPayload = JSON.stringify({
      summary: analysis.summary || "",
      sections: analysis.sections || {},
      item_details: analysis.item_details || [],
    });

    // Update estimated_value / emd if AI found them and DB doesn't have them
    const financialUpdates: Record<string, any> = {};
    if (analysis.financials?.estimated_value && !bid.estimated_value) {
      financialUpdates.estimated_value = analysis.financials.estimated_value;
    }
    // Don't let the AI's guess overwrite an EMD already extracted from the
    // actual tender document
    if (analysis.financials?.emd_amount && !bid.ai_emd_amount) {
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

    } catch (innerErr) {
      // Restore the pre-analysis status so the bid isn't stuck in "analyzing"
      await supabase
        .from("gem_bids")
        .update({ status: prevStatus })
        .eq("id", bid_id);
      throw innerErr;
    }
  } catch (error: any) {
    console.error("GeM analyze error:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed" },
      { status: 500 }
    );
  }
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
