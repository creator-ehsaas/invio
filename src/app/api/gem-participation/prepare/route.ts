import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { aiChat } from "@/lib/ai-client";
import { writeAuditLog, serviceClient } from "@/lib/gem-audit";
import { getAuthContext, getOwnedSession } from "@/lib/gem-participation";

/**
 * AI preparation step: maps the bid's analyzed requirements against the
 * tenant's shared Invio business profile and produces a per-field suggestion
 * set (value + source + reasoning) plus the proposed document uploads with
 * SHA-256 hashes. Nothing here touches the GeM portal — output goes to the
 * consent screen for explicit user review.
 *
 * POST /api/gem-participation/prepare  Body: { session_id }
 */

const PREPARE_PROMPT = `You are assisting a business in filling a GeM (Government e-Marketplace, India) bid participation form.
Based on the tender analysis and the company profile below, suggest values for the participation form fields.

Return ONLY valid JSON — an object with a "fields" array:
{
  "fields": [
    {
      "field_key": "snake_case_key",
      "field_label": "Label as it likely appears on the GeM form",
      "input_type": "text|number|textarea|boolean",
      "suggested_value": "the value to fill (string; for boolean use 'Yes'/'No')",
      "source": "where this came from: 'business profile', 'GeM capability profile', 'tender analysis', or 'estimate — needs review'",
      "reasoning": "one sentence: why this value"
    }
  ]
}

Include fields commonly required for GeM bid participation, such as (only where the tender or profile gives a basis):
- Offered unit price and total price (base on the tender's estimated value and quantities; mark source as 'estimate — needs review')
- Delivery period in days (from the tender's delivery terms)
- Brand / model / make offered (from tender item specifications; if the tender allows any make, say so)
- Country of origin, local content percentage (Make in India declaration)
- MSE/MSME status and Udyam number (from the capability profile)
- Warranty period offered (matching what the tender demands)
- Authorized signatory / contact details (from the business profile)
- Any tender-specific declarations identified in the requirements

RULES:
- NEVER invent registration numbers, certificate numbers, turnover figures, or experience the profile does not contain. If the tender requires something the profile lacks, still include the field but set suggested_value to "" and source to "missing — user must provide".
- Use only information present in the inputs. Do not assume any industry or product type.
- For prices, ALWAYS mark source as 'estimate — needs review'.
- 10 to 25 fields. Every string single-line.`;

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function parseJsonArray(raw: string): any[] | null {
  const text = raw.replace(/^```json?\s*\n?/im, "").replace(/\n?```\s*$/im, "").trim();
  // Accept either {"fields":[...]} (JSON mode) or a bare array (fallback)
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const parsed = JSON.parse(objMatch[0]);
      if (Array.isArray(parsed.fields)) return parsed.fields;
    } catch { /* fall through to array parse */ }
  }
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      const parsed = JSON.parse(arrMatch[0]);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { session_id } = await request.json();
    if (!session_id) return NextResponse.json({ error: "session_id is required" }, { status: 400 });

    const session = await getOwnedSession(auth.businessId, session_id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!["draft", "awaiting_consent"].includes(session.status)) {
      return NextResponse.json({ error: `Cannot re-prepare a session in status "${session.status}"` }, { status: 422 });
    }

    const supabase = serviceClient();
    await supabase.from("gem_participation_sessions").update({ status: "preparing", updated_at: new Date().toISOString() }).eq("id", session_id);

    try {
      const [{ data: bid }, { data: business }, { data: gemProfile }, { data: genDocs }] = await Promise.all([
        supabase.from("gem_bids").select("*").eq("id", session.bid_id).single(),
        supabase.from("businesses").select("name, gstin, pan, address, phone, email, state_code").eq("id", auth.businessId).single(),
        supabase.from("gem_business_profile").select("*").eq("business_id", auth.businessId).maybeSingle(),
        supabase.from("gem_bid_documents").select("id, file_name, file_url, doc_type").eq("gem_bid_id", session.bid_id).eq("is_generated", true),
      ]);

      if (!bid) throw new Error("Bid not found");

      let analysisSummary = "";
      try {
        const parsed = JSON.parse(bid.ai_summary || "{}");
        analysisSummary = [
          parsed.summary,
          ...Object.entries(parsed.sections || {}).map(([k, v]) => `${k}: ${v}`),
          parsed.item_details?.length
            ? `Items: ${parsed.item_details.map((i: any) => `${i.item_name} x${i.quantity} ${i.unit} (${i.specifications})`).join("; ")}`
            : "",
        ].filter(Boolean).join("\n");
      } catch {
        analysisSummary = bid.ai_summary || "";
      }

      const context = `
--- TENDER ---
Bid Number: ${bid.gem_bid_id}
Title: ${bid.title}
Quantity: ${bid.quantity || "N/A"} ${bid.uom || ""}
Estimated Value: ₹${bid.estimated_value?.toLocaleString("en-IN") || "Unknown"}
EMD: ₹${bid.ai_emd_amount?.toLocaleString("en-IN") || "Unknown"}
Closing: ${bid.end_date || "N/A"}

--- TENDER ANALYSIS ---
${analysisSummary.substring(0, 12000)}

--- KEY REQUIREMENTS ---
${(bid.ai_requirements || []).map((r: any) => `[${r.category}${r.mandatory ? ", MANDATORY" : ""}] ${r.title}: ${r.description}`).join("\n").substring(0, 6000)}

--- COMPANY PROFILE (Invio) ---
Company: ${business?.name || "N/A"}
GSTIN: ${business?.gstin || "Not available"}
PAN: ${business?.pan || "Not available"}
Address: ${business?.address || "Not available"}
Phone: ${business?.phone || "Not available"}
Email: ${business?.email || "Not available"}

--- GeM CAPABILITY PROFILE ---
MSME Category: ${gemProfile?.msme_category || "Not set"}
Udyam Number: ${gemProfile?.udyam_number || "Not available"}
Years in Business: ${gemProfile?.years_in_business ?? "Unknown"}
Turnover (last 3 FY): ${[gemProfile?.turnover_fy1, gemProfile?.turnover_fy2, gemProfile?.turnover_fy3].filter((t) => t != null).map((t) => `₹${Number(t).toLocaleString("en-IN")}`).join(", ") || "Not available"}
Certifications: ${gemProfile?.certifications?.join(", ") || "None recorded"}
GeM Seller ID: ${gemProfile?.gem_seller_id || "Not recorded"}
      `.trim();

      const rawResult = await aiChat(
        [{ role: "user", content: `${PREPARE_PROMPT}\n\n${context}` }],
        // Reproducible: re-running prepare on the same bid + profile yields
        // the same suggestions
        { tier: "enhanced", temperature: 0, seed: 42, jsonMode: true, maxTokens: 4000 }
      );

      const suggestions = parseJsonArray(rawResult);
      if (!suggestions || suggestions.length === 0) {
        throw new Error("AI could not produce field suggestions. Try again.");
      }

      // Re-prepare: clear previous suggestions
      await supabase.from("gem_participation_fields").delete().eq("session_id", session_id);
      await supabase.from("gem_participation_documents").delete().eq("session_id", session_id);

      const fieldRows = suggestions
        .filter((s: any) => s.field_key && s.field_label)
        .map((s: any) => ({
          session_id,
          field_key: String(s.field_key).substring(0, 100),
          field_label: String(s.field_label).substring(0, 200),
          input_type: ["text", "number", "textarea", "boolean"].includes(s.input_type) ? s.input_type : "text",
          ai_suggested_value: s.suggested_value != null ? String(s.suggested_value).substring(0, 2000) : "",
          ai_source: s.source ? String(s.source).substring(0, 200) : null,
          ai_reasoning: s.reasoning ? String(s.reasoning).substring(0, 500) : null,
          status: "suggested",
        }));
      const { data: insertedFields, error: fieldsError } = await supabase
        .from("gem_participation_fields")
        .insert(fieldRows)
        .select();
      if (fieldsError) throw new Error(fieldsError.message);

      // Propose previously generated documents, hashing each from storage
      const docRows: any[] = [];
      for (const doc of genDocs || []) {
        let hash: string | null = null;
        if (!doc.file_url.startsWith("http")) {
          const { data: fileData } = await supabase.storage.from("gem-documents").download(doc.file_url);
          if (fileData) hash = sha256(Buffer.from(await fileData.arrayBuffer()));
        }
        docRows.push({
          session_id,
          source_doc_id: doc.id,
          file_name: doc.file_name,
          purpose: doc.doc_type.replace(/_/g, " "),
          sha256: hash,
          status: "proposed",
        });
      }
      let insertedDocs: any[] = [];
      if (docRows.length) {
        const { data, error: docsError } = await supabase
          .from("gem_participation_documents")
          .insert(docRows)
          .select();
        if (docsError) throw new Error(docsError.message);
        insertedDocs = data || [];
      }

      await supabase
        .from("gem_participation_sessions")
        .update({ status: "awaiting_consent", updated_at: new Date().toISOString() })
        .eq("id", session_id);

      await writeAuditLog({
        businessId: auth.businessId,
        sessionId: session_id,
        actor: "ai",
        action: "ai_suggestions_created",
        payload: {
          field_count: insertedFields?.length || 0,
          document_count: insertedDocs.length,
          fields: (insertedFields || []).map((f: any) => ({
            field_key: f.field_key,
            suggested_value: f.ai_suggested_value,
            source: f.ai_source,
            reasoning: f.ai_reasoning,
          })),
          documents: insertedDocs.map((d: any) => ({ file_name: d.file_name, sha256: d.sha256 })),
        },
      });

      return NextResponse.json({ fields: insertedFields, documents: insertedDocs });
    } catch (innerErr: any) {
      await supabase
        .from("gem_participation_sessions")
        .update({ status: "draft", error_message: innerErr.message, updated_at: new Date().toISOString() })
        .eq("id", session_id);
      throw innerErr;
    }
  } catch (error: any) {
    console.error("gem-participation prepare error:", error);
    return NextResponse.json({ error: error.message || "Preparation failed" }, { status: 500 });
  }
}
