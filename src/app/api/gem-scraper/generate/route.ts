import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiChat } from "@/lib/ai-client";
import type { GemDocType } from "@/types/gem";

/**
 * GeM Document Generator — AI-generates submission-ready documents.
 *
 * POST /api/gem-scraper/generate
 * Body: { bid_id: string, doc_type: GemDocType, po_ids?: string[] }
 */

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
    const { bid_id, doc_type, po_ids = [] } = body as {
      bid_id: string;
      doc_type: GemDocType;
      po_ids?: string[];
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

    // Fetch POs for experience proof if requested
    let purchaseOrders: any[] = [];
    if (po_ids.length > 0) {
      const { data: pos } = await supabase
        .from("purchase_invoices")
        .select("*, supplier:suppliers(name, business_name)")
        .in("id", po_ids)
        .eq("business_id", businessId);

      purchaseOrders = pos || [];
    } else if (doc_type === "experience_cert") {
      // Auto-fetch recent completed POs for experience cert
      const { data: pos } = await supabase
        .from("purchase_invoices")
        .select("*, supplier:suppliers(name, business_name)")
        .eq("business_id", businessId)
        .eq("status", "paid")
        .order("total", { ascending: false })
        .limit(5);

      purchaseOrders = pos || [];
    }

    // Build the generation prompt based on doc type
    let prompt = "";
    let fileName = "";

    const companyInfo = `
Company Name: ${business.name}
GSTIN: ${business.gstin || "N/A"}
PAN: ${business.pan || "N/A"}
Address: ${business.address || "N/A"}
Phone: ${business.phone || "N/A"}
Email: ${business.email || "N/A"}
    `.trim();

    const bidInfo = `
Bid Number: ${bid.gem_bid_id}
Title: ${bid.title}
Department: ${bid.department || "N/A"}
Organization: ${bid.organization || "N/A"}
Estimated Value: ₹${bid.estimated_value?.toLocaleString("en-IN") || "N/A"}
Closing Date: ${bid.end_date ? new Date(bid.end_date).toLocaleDateString("en-IN") : "N/A"}
    `.trim();

    switch (doc_type) {
      case "cover_letter":
        fileName = `Cover_Letter_${bid.gem_bid_id.replace(/\//g, "_")}.txt`;
        prompt = `Generate a professional cover letter for a government tender bid submission on the GeM portal.

${companyInfo}

${bidInfo}

The cover letter should:
1. Be addressed to: "The Buyer, ${bid.department || "Government Department"}"
2. Reference the exact bid number: ${bid.gem_bid_id}
3. Express interest in participating in the tender
4. Briefly summarize our company capabilities relevant to this bid
5. Mention that all required documents are enclosed
6. Be formal, professional, and in standard Indian government procurement language
7. Include place for signature, name, designation, and company seal
8. Today's date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}

Format as a ready-to-print plain text letter. Do NOT use markdown.`;
        break;

      case "compliance_matrix":
        fileName = `Compliance_Matrix_${bid.gem_bid_id.replace(/\//g, "_")}.txt`;
        const requirements = bid.ai_requirements || [];
        prompt = `Generate a formal compliance matrix table for a GeM tender submission.

${companyInfo}

${bidInfo}

Requirements from the tender:
${requirements.map((r: any, i: number) => `${i + 1}. [${r.category}] ${r.title}: ${r.description} (${r.mandatory ? "MANDATORY" : "OPTIONAL"})`).join("\n")}

The compliance matrix should:
1. Be a structured table with columns: S.No | Requirement | Compliance Status | Remarks
2. For each requirement, state "Complied" or "Partially Complied" or "Will Comply"
3. Add specific remarks on how the company meets each requirement
4. Include a declaration at the bottom stating all information is true
5. Include place for authorized signatory and company seal
6. Date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}

Format as a ready-to-print plain text document. Do NOT use markdown.`;
        break;

      case "experience_cert":
        fileName = `Work_Experience_${bid.gem_bid_id.replace(/\//g, "_")}.txt`;
        const poList = purchaseOrders
          .map(
            (po: any, i: number) =>
              `${i + 1}. Bill #${po.bill_number} | Date: ${new Date(po.bill_date).toLocaleDateString("en-IN")} | Amount: ₹${po.total?.toLocaleString("en-IN")} | Supplier: ${po.supplier?.name || po.supplier_name || "N/A"} | Status: ${po.status}`
          )
          .join("\n");

        prompt = `Generate a Previous Work Experience Certificate for a GeM tender submission.

${companyInfo}

${bidInfo}

Our completed orders (as proof of prior experience):
${poList || "No purchase orders available. Generate a template with placeholder fields."}

The experience certificate should:
1. Be a self-declaration format (common in Indian government procurement)
2. List each completed order with: Order Reference, Client/Supplier Name, Value, Date, and Brief Scope
3. State that all work was completed satisfactorily
4. Include a total value of completed orders
5. Include a declaration that this information can be verified
6. Include place for authorized signatory, company seal, and date
7. Date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}

Format as a ready-to-print plain text document. Do NOT use markdown.`;
        break;

      case "undertaking":
        fileName = `Undertaking_${bid.gem_bid_id.replace(/\//g, "_")}.txt`;
        prompt = `Generate a standard Self-Declaration / Undertaking for a GeM (Government e-Marketplace) tender submission.

${companyInfo}

${bidInfo}

The undertaking should include the following standard declarations commonly required on GeM:
1. The firm is not blacklisted by any Central/State Government or PSU.
2. The firm has not been debarred by any government procurement agency.
3. All information provided in the bid is true and correct.
4. The firm agrees to abide by all terms and conditions of the bid.
5. The firm has the necessary infrastructure, manpower, and capability to fulfill the order.
6. No conflict of interest exists.
7. The firm complies with all applicable laws and regulations.
8. The authorized signatory has the power to commit the organization.

Format:
- Title: "SELF-DECLARATION / UNDERTAKING"
- On company letterhead format
- Addressed to the buyer
- Reference the specific bid number
- Include date: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
- Place for: Authorized Signatory Name, Designation, Company Seal, and Date

Format as a ready-to-print plain text document. Do NOT use markdown.`;
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

    // Upload to Supabase Storage
    const storagePath = `${businessId}/${bid_id}/${fileName}`;
    const fileBuffer = Buffer.from(generatedContent, "utf-8");

    const { error: uploadError } = await supabase.storage
      .from("gem-documents")
      .upload(storagePath, fileBuffer, {
        contentType: "text/plain",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("gem-documents")
      .getPublicUrl(storagePath);

    // Save document record
    const { data: docRecord, error: docError } = await supabase
      .from("gem_bid_documents")
      .insert({
        gem_bid_id: bid_id,
        doc_type,
        file_name: fileName,
        file_url: storagePath,
        is_generated: true,
      })
      .select()
      .single();

    if (docError) {
      console.error("Doc record error:", docError);
    }

    return NextResponse.json({
      doc_id: docRecord?.id || null,
      doc_type,
      file_name: fileName,
      file_url: urlData?.publicUrl || storagePath,
      content_preview: generatedContent.substring(0, 500),
    });
  } catch (error: any) {
    console.error("GeM generate error:", error);
    return NextResponse.json(
      { error: error.message || "Document generation failed" },
      { status: 500 }
    );
  }
}
