import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { aiChat } from "@/lib/ai-client";
import type { GemDocType } from "@/types/gem";

/**
 * GeM Document Generator — AI-generates submission-ready documents.
 * Documents are generated in A4 format with professional Indian government styling.
 * Supports embedding company stamp and authorized signatory signature.
 *
 * POST /api/gem-scraper/generate
 * Body: { bid_id: string, doc_type: GemDocType, po_ids?: string[], form_data?: Record<string, string> }
 */

// A4 dimensions: 210mm × 297mm
// Professional margins: 25mm all sides
const A4_STYLES = `
@page {
  size: A4;
  margin: 25mm;
}
* {
  box-sizing: border-box;
}
html, body {
  width: 210mm;
  min-height: 297mm;
  margin: 0;
  padding: 0;
}
body {
  font-family: 'Times New Roman', 'Noto Serif', Georgia, serif;
  font-size: 12pt;
  line-height: 1.6;
  color: #000;
  padding: 25mm;
  background: #fff;
}
.letterhead {
  text-align: center;
  border-bottom: 3px double #000;
  padding-bottom: 12pt;
  margin-bottom: 20pt;
}
.letterhead .company-name {
  font-size: 18pt;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1pt;
  margin: 0 0 4pt 0;
}
.letterhead .company-details {
  font-size: 10pt;
  color: #333;
  margin: 2pt 0;
}
.letterhead .gstin-pan {
  font-size: 10pt;
  font-weight: bold;
  margin-top: 6pt;
}
.logo-container {
  text-align: center;
  margin-bottom: 8pt;
}
.logo-container img {
  max-height: 60pt;
  max-width: 180pt;
}
.ref-date-block {
  display: flex;
  justify-content: space-between;
  margin: 16pt 0;
  font-size: 11pt;
}
.ref-number {
  font-weight: bold;
}
.date-block {
  text-align: right;
}
.addressee {
  margin: 16pt 0;
  font-size: 11pt;
}
.addressee strong {
  display: block;
  margin-bottom: 4pt;
}
.subject-line {
  font-weight: bold;
  text-decoration: underline;
  margin: 16pt 0 12pt 0;
  font-size: 12pt;
}
.salutation {
  margin: 12pt 0 8pt 0;
}
.body-text {
  text-align: justify;
  margin: 8pt 0;
}
.body-text p {
  margin: 8pt 0;
  text-indent: 0;
}
h1 {
  font-size: 14pt;
  text-align: center;
  text-transform: uppercase;
  font-weight: bold;
  margin: 20pt 0 16pt 0;
  text-decoration: underline;
}
h2 {
  font-size: 12pt;
  font-weight: bold;
  margin: 14pt 0 8pt 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 12pt 0;
  font-size: 10pt;
}
th, td {
  border: 1px solid #000;
  padding: 6pt 8pt;
  vertical-align: top;
  text-align: left;
}
th {
  background-color: #e8e8e8;
  font-weight: bold;
  text-align: center;
}
.total-row {
  font-weight: bold;
  background-color: #f5f5f5;
}
ol, ul {
  margin: 10pt 0;
  padding-left: 24pt;
}
li {
  margin: 6pt 0;
  text-align: justify;
}
.declaration-section {
  margin-top: 24pt;
  padding-top: 12pt;
  border-top: 1px solid #ccc;
}
.signature-block {
  margin-top: 50pt;
  page-break-inside: avoid;
}
.signature-area {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 40pt;
}
.signature-left {
  flex: 1;
}
.signature-right {
  flex: 1;
  text-align: right;
}
.stamp-box {
  display: inline-block;
  min-width: 100pt;
  min-height: 80pt;
  border: 1px dashed #999;
  text-align: center;
  padding: 8pt;
  margin-bottom: 8pt;
}
.stamp-box.has-stamp {
  border: none;
}
.stamp-box img {
  max-width: 120pt;
  max-height: 100pt;
}
.stamp-placeholder {
  color: #666;
  font-size: 9pt;
  font-style: italic;
}
.signature-image {
  max-width: 120pt;
  max-height: 50pt;
  margin-bottom: 4pt;
}
.signature-line {
  border-top: 1px solid #000;
  width: 160pt;
  display: inline-block;
  margin-top: 40pt;
}
.signatory-name {
  font-weight: bold;
  margin-top: 4pt;
}
.signatory-designation {
  font-size: 10pt;
  color: #333;
}
.date-place {
  margin-top: 16pt;
  font-size: 11pt;
}
.date-place span {
  display: block;
  margin: 4pt 0;
}
.enclosure-section {
  margin-top: 24pt;
  font-size: 10pt;
}
.enclosure-section strong {
  display: block;
  margin-bottom: 4pt;
}
.page-footer {
  position: fixed;
  bottom: 10mm;
  left: 25mm;
  right: 25mm;
  text-align: center;
  font-size: 9pt;
  color: #666;
  border-top: 1px solid #ddd;
  padding-top: 6pt;
}
@media print {
  body { padding: 0; }
  .page-footer { position: fixed; }
}
`;

function escapeHtml(value: string | null | undefined): string {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url; // already embedded (storage fallback)
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

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

    const businessId = userData.business_id;
    const body = await request.json();
    const { bid_id, doc_type, po_ids = [], form_data = {} } = body as {
      bid_id: string;
      doc_type: GemDocType;
      po_ids?: string[];
      form_data?: Record<string, string>;
    };

    if (!bid_id || !doc_type) {
      return NextResponse.json({ error: "bid_id and doc_type are required" }, { status: 400 });
    }

    // Fetch bid details
    const { data: bid } = await supabase
      .from("gem_bids")
      .select("*")
      .eq("id", bid_id)
      .eq("business_id", businessId)
      .single();

    if (!bid) {
      return NextResponse.json({ error: "Bid not found" }, { status: 404 });
    }

    // Fetch business profile
    const { data: business } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .single();

    if (!business) {
      return NextResponse.json({ error: "Business profile not found" }, { status: 400 });
    }

    // Merge user-supplied form values over the stored profile, then check
    // what is still missing. Anything missing goes back as a dynamic form.
    const profile = {
      name: (business.name || form_data.name || "").trim(),
      address: (business.address || form_data.address || "").trim(),
      gstin: (business.gstin || form_data.gstin || "").trim(),
      pan: (business.pan || form_data.pan || "").trim(),
      phone: business.phone || "",
      email: business.email || "",
    };
    const signatoryName = (form_data.signatory_name || "").trim();
    const signatoryDesignation = (form_data.signatory_designation || "").trim();

    const missingFields: { field: string; label: string; type: string }[] = [];
    if (!profile.name) missingFields.push({ field: "name", label: "Company Name", type: "text" });
    if (!profile.address) missingFields.push({ field: "address", label: "Company Address", type: "textarea" });
    if (!profile.gstin && !profile.pan) missingFields.push({ field: "gstin", label: "GSTIN or PAN", type: "text" });
    // Every document carries a signature block — the signatory must be a real person
    if (!signatoryName) missingFields.push({ field: "signatory_name", label: "Authorized Signatory Name", type: "text" });
    if (!signatoryDesignation) missingFields.push({ field: "signatory_designation", label: "Signatory Designation (e.g. Proprietor, Director)", type: "text" });

    if (missingFields.length > 0) {
      return NextResponse.json({
        requires_input: true,
        missing_fields: missingFields,
        message: "Please provide the following information to generate the document",
      });
    }

    // Fetch images for embedding
    const [logoBase64, signatureBase64, stampBase64] = await Promise.all([
      business.logo_url ? fetchImageAsBase64(business.logo_url) : null,
      business.signature_url ? fetchImageAsBase64(business.signature_url) : null,
      business.stamp_url ? fetchImageAsBase64(business.stamp_url) : null,
    ]);

    // Fetch sales invoices for work experience proof
    let purchaseOrders: any[] = [];
    if (po_ids.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, customer_name, status")
        .in("id", po_ids)
        .eq("business_id", businessId);
      purchaseOrders = invs || [];
    } else if (doc_type === "experience_cert") {
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total, customer_name, status")
        .eq("business_id", businessId)
        .in("status", ["paid", "sent"])
        .order("total", { ascending: false })
        .limit(5);
      purchaseOrders = invs || [];
    }

    // A work experience certificate must only reference real invoices —
    // never let the AI invent past orders for a government submission.
    if (doc_type === "experience_cert" && purchaseOrders.length === 0) {
      return NextResponse.json(
        { error: "No paid or sent sales invoices found. Attach sales invoices (Work Experience) or create invoices first — experience certificates can only be generated from real records." },
        { status: 422 }
      );
    }

    // Build document components
    const docDate = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const bidIdSlug = bid.gem_bid_id.replace(/\//g, "_");
    const refNumber = `INV/${doc_type.toUpperCase()}/${new Date().getFullYear()}/${Math.floor(Math.random() * 9000) + 1000}`;

    // Generate letterhead HTML
    const letterheadHtml = `
      <div class="letterhead">
        ${logoBase64 ? `<div class="logo-container"><img src="${logoBase64}" alt="Company Logo" /></div>` : ""}
        <p class="company-name">${escapeHtml(profile.name)}</p>
        ${profile.address ? `<p class="company-details">${escapeHtml(profile.address)}</p>` : ""}
        ${profile.phone || profile.email ? `<p class="company-details">${[profile.phone, profile.email].filter(Boolean).map(escapeHtml).join(" | ")}</p>` : ""}
        ${profile.gstin || profile.pan ? `<p class="gstin-pan">${profile.gstin ? `GSTIN: ${escapeHtml(profile.gstin)}` : ""}${profile.gstin && profile.pan ? " | " : ""}${profile.pan ? `PAN: ${escapeHtml(profile.pan)}` : ""}</p>` : ""}
      </div>
    `;

    // Generate signature block HTML with stamp and signature
    const signatureBlockHtml = `
      <div class="signature-block">
        <div class="signature-area">
          <div class="signature-left">
            <div class="date-place">
              <span><strong>Place:</strong> ${escapeHtml(profile.address.split(",").pop()?.trim()) || "_______________"}</span>
              <span><strong>Date:</strong> ${docDate}</span>
            </div>
          </div>
          <div class="signature-right">
            <div class="stamp-box${stampBase64 ? " has-stamp" : ""}">
              ${stampBase64 ? `<img src="${stampBase64}" alt="Company Stamp" />` : '<p class="stamp-placeholder">Company Stamp</p>'}
            </div>
            <br/>
            ${signatureBase64 ? `<img src="${signatureBase64}" alt="Signature" class="signature-image" />` : '<div class="signature-line"></div>'}
            <p class="signatory-name">${escapeHtml(signatoryName)}</p>
            <p class="signatory-designation">${escapeHtml(signatoryDesignation)}</p>
            <p class="signatory-designation">For ${escapeHtml(profile.name)}</p>
          </div>
        </div>
      </div>
    `;

    const companyInfo = `
Company Name: ${profile.name}
GSTIN: ${profile.gstin || "N/A"}
PAN: ${profile.pan || "N/A"}
Address: ${profile.address || "N/A"}
Phone: ${profile.phone || "N/A"}
Email: ${profile.email || "N/A"}
Authorized Signatory: ${signatoryName}
Designation: ${signatoryDesignation}
    `.trim();

    const bidInfo = `
Bid Number: ${bid.gem_bid_id}
Title: ${bid.title}
Department: ${bid.department || "N/A"}
Organization: ${bid.organization || "N/A"}
Estimated Value: ₹${bid.estimated_value?.toLocaleString("en-IN") || "N/A"}
Closing Date: ${bid.end_date ? new Date(bid.end_date).toLocaleDateString("en-IN") : "N/A"}
    `.trim();

    let prompt = "";
    let fileName = "";

    switch (doc_type) {
      case "cover_letter":
        fileName = `Cover_Letter_${bidIdSlug}.doc`;
        prompt = `Generate the BODY CONTENT ONLY for a professional cover letter for a GeM tender bid submission.
DO NOT include <html>, <head>, <body>, <style> tags, or letterhead — these will be added separately.

${companyInfo}

${bidInfo}

Reference Number: ${refNumber}
Date: ${docDate}

Generate ONLY the content starting from the reference/date block to just before the signature. Include:

1. Reference number and date block (use class="ref-date-block")
2. Addressee block addressed to: "The Buyer, ${bid.department || "Government Department"}, ${bid.organization || ""}".trim()
3. Subject line referencing bid number: ${bid.gem_bid_id}
4. Professional salutation
5. Body paragraphs (3-4 paragraphs) that:
   - Express interest in participating in the tender
   - Summarize company capabilities relevant to this bid category
   - Mention compliance with all tender requirements
   - State that all required documents are enclosed
6. Formal closing (Yours faithfully)

Use these CSS classes: ref-date-block, addressee, subject-line, salutation, body-text
Return ONLY the HTML content, no code fences.`;
        break;

      case "compliance_matrix": {
        fileName = `Compliance_Matrix_${bidIdSlug}.doc`;
        const requirements = bid.ai_requirements || [];
        prompt = `Generate the BODY CONTENT ONLY for a formal compliance matrix document.
DO NOT include <html>, <head>, <body>, <style> tags, or letterhead — these will be added separately.

${companyInfo}

${bidInfo}

Reference Number: ${refNumber}
Date: ${docDate}

Requirements from the tender:
${requirements.length > 0 ? requirements.map((r: any, i: number) => `${i + 1}. [${r.category}] ${r.title}: ${r.description} (${r.mandatory ? "MANDATORY" : "OPTIONAL"})`).join("\n") : "No specific requirements extracted. Generate a standard compliance matrix with typical GeM requirements."}

Generate ONLY the content including:
1. Title: "COMPLIANCE MATRIX" (use <h1>)
2. Reference to bid number
3. HTML table with columns: S.No | Requirement/Clause | Category | Compliance Status | Our Capability/Remarks
4. For each requirement, state "Complied" or "Complied with Deviation" with specific capability remarks
5. Declaration paragraph stating all information is true and correct

Return ONLY the HTML content, no code fences.`;
        break;
      }

      case "experience_cert": {
        fileName = `Work_Experience_${bidIdSlug}.doc`;
        const poList = purchaseOrders
          .map((inv: any, i: number) =>
            `${i + 1}. Invoice #${inv.invoice_number} | Date: ${new Date(inv.invoice_date).toLocaleDateString("en-IN")} | Amount: ₹${inv.total?.toLocaleString("en-IN")} | Client: ${inv.customer_name || "N/A"}`
          )
          .join("\n");

        prompt = `Generate the BODY CONTENT ONLY for a Previous Work Experience Certificate.
DO NOT include <html>, <head>, <body>, <style> tags, or letterhead — these will be added separately.

${companyInfo}

${bidInfo}

Reference Number: ${refNumber}
Date: ${docDate}

Past supply/service invoices (proof of prior experience):
${poList}

IMPORTANT: Use ONLY the invoices listed above. Do NOT invent, estimate, or add any additional orders, clients, or values.

Generate ONLY the content including:
1. Title: "CERTIFICATE OF PREVIOUS WORK EXPERIENCE" (use <h1>)
2. Opening declaration paragraph certifying work experience
3. HTML table with columns: S.No | Order/Invoice Ref | Client/Buyer Name | Order Value (₹) | Period | Scope of Work | Status
4. Total value row at bottom
5. Declaration paragraph certifying authenticity

Return ONLY the HTML content, no code fences.`;
        break;
      }

      case "undertaking":
        fileName = `Undertaking_${bidIdSlug}.doc`;
        prompt = `Generate the BODY CONTENT ONLY for a Self-Declaration/Undertaking for GeM tender submission.
DO NOT include <html>, <head>, <body>, <style> tags, or letterhead — these will be added separately.

${companyInfo}

${bidInfo}

Reference Number: ${refNumber}
Date: ${docDate}

Generate ONLY the content including:
1. Title: "SELF-DECLARATION / UNDERTAKING" (use <h1>)
2. Addressee: "To, The Buyer, ${bid.department || "Government Department"}"
3. Reference to bid number: ${bid.gem_bid_id}
4. Opening paragraph: "I/We, the undersigned, do hereby solemnly declare and undertake as follows:"
5. Numbered list (use <ol>) of standard GeM declarations:
   - Not blacklisted by any Central/State Government or PSU
   - Not debarred by any procurement agency
   - All bid information is true, correct, and complete
   - Agree to all terms and conditions of the bid
   - Have necessary infrastructure, manpower, and capability
   - No conflict of interest exists
   - Comply with all applicable laws and regulations
   - Authorized signatory has power to commit the organization
   - Undertake to supply items as per specification within delivery period
   - Not convicted of any criminal offence related to business conduct
   - Accept that false declaration will result in bid rejection and blacklisting
6. Closing declaration paragraph

Return ONLY the HTML content, no code fences.`;
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported document type: ${doc_type}` },
          { status: 400 }
        );
    }

    // Generate document content via AI
    const generatedContent = await aiChat(
      [{ role: "user", content: prompt }],
      {
        tier: "enhanced",
        temperature: 0.2,
        maxTokens: 4096,
      }
    );

    if (!generatedContent.trim()) {
      return NextResponse.json({ error: "Document generation failed" }, { status: 500 });
    }

    // Clean AI response of any code fences or tags
    let bodyContent = generatedContent
      .replace(/^```html?\s*/i, "")
      .replace(/```\s*$/i, "")
      .replace(/^<html[\s\S]*?<body[^>]*>/i, "")
      .replace(/<\/body[\s\S]*$/i, "")
      .trim();

    // Assemble complete A4 document
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName.replace(".doc", "")}</title>
  <style>${A4_STYLES}</style>
</head>
<body>
  ${letterheadHtml}
  ${bodyContent}
  ${signatureBlockHtml}
</body>
</html>`;

    // Use service role client for storage
    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const storagePath = `${businessId}/${bid_id}/${fileName}`;
    const fileBuffer = Buffer.from(htmlContent, "utf-8");

    const { error: uploadError } = await serviceSupabase.storage
      .from("gem-documents")
      .upload(storagePath, fileBuffer, { contentType: "application/msword", upsert: true });

    // Only record the document if it actually exists in storage — the bucket
    // is private, so later downloads go through /api/gem-scraper/download.
    let docRecord: { id: string } | null = null;
    if (!uploadError) {
      const { data, error: docError } = await serviceSupabase
        .from("gem_bid_documents")
        .insert({
          gem_bid_id: bid_id,
          doc_type,
          file_name: fileName,
          file_url: storagePath,
          is_generated: true,
        })
        .select("id")
        .single();
      if (docError) console.error("Doc record insert error:", docError);
      docRecord = data;
    } else {
      console.warn("Storage upload failed:", uploadError.message);
    }

    return NextResponse.json({
      doc_id: docRecord?.id || null,
      doc_type,
      file_name: fileName,
      saved: !uploadError,
      warning: uploadError ? "Document generated but could not be saved for later download." : undefined,
      content: htmlContent,
    });
  } catch (error: any) {
    console.error("GeM generate error:", error);
    return NextResponse.json(
      { error: error.message || "Document generation failed" },
      { status: 500 }
    );
  }
}
