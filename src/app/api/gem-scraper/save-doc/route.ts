import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();
    if (!userData?.business_id) return NextResponse.json({ error: "No business" }, { status: 400 });

    const body = await request.json();
    const { bid_id, text, doc_links, pdfText, financials, specDocs } = body as {
      bid_id: string;
      text: string;
      doc_links: { url: string; name: string; category?: string }[];
      pdfText?: string;
      financials?: { estimated_value?: number; emd_amount?: number };
      specDocs?: { name: string; category: string; url: string; textLength: number }[];
    };

    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify bid belongs to this user's business (prevent IDOR)
    const { data: ownBid } = await serviceSupabase
      .from("gem_bids")
      .select("id, estimated_value, ai_emd_amount")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();
    if (!ownBid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    // Combine page text and PDF spec text for richer analysis
    const combinedText = [text, pdfText].filter(Boolean).join("\n\n");

    if (combinedText) {
      const updateData: Record<string, any> = {
        // 25k page text + 60k crawled document text + OCR'd scanned pages.
        // Analysis dedupes/budgets this down before it reaches the AI.
        raw_full_text: combinedText.substring(0, 120000),
        updated_at: new Date().toISOString(),
      };

      // Update financial values if extracted from actual tender doc
      if (financials?.estimated_value && financials.estimated_value > 0) {
        updateData.estimated_value = financials.estimated_value;
      }
      if (financials?.emd_amount && financials.emd_amount > 0) {
        updateData.ai_emd_amount = financials.emd_amount;
      }

      await serviceSupabase
        .from("gem_bids")
        .update(updateData)
        .eq("id", bid_id)
        .eq("business_id", userData.business_id);
    }

    // Save discovered document links as gem_bid_documents records
    if (doc_links?.length) {
      for (const link of doc_links.slice(0, 25)) {
        const { data: existing } = await serviceSupabase
          .from("gem_bid_documents")
          .select("id, category")
          .eq("gem_bid_id", bid_id)
          .eq("file_url", link.url)
          .maybeSingle();

        if (!existing) {
          await serviceSupabase.from("gem_bid_documents").insert({
            gem_bid_id: bid_id,
            doc_type: "tender_document",
            category: link.category || "other",
            file_name: link.name.substring(0, 200),
            file_url: link.url,
            is_generated: false,
          });
        } else if (link.category && existing.category !== link.category) {
          await serviceSupabase
            .from("gem_bid_documents")
            .update({ category: link.category })
            .eq("id", existing.id);
        }
      }
    }

    // Log spec doc extraction stats
    const specDocCount = specDocs?.length || 0;
    const specCharCount = specDocs?.reduce((sum, d) => sum + d.textLength, 0) || 0;

    return NextResponse.json({
      ok: true,
      spec_docs_extracted: specDocCount,
      spec_text_chars: specCharCount,
    });
  } catch (err: any) {
    console.error("save-doc error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
