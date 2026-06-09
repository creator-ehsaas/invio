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
    const { bid_id, text, doc_links } = body as {
      bid_id: string;
      text: string;
      doc_links: { url: string; name: string }[];
    };

    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Update raw_full_text with the richer page content
    if (text) {
      await serviceSupabase
        .from("gem_bids")
        .update({ raw_full_text: text, updated_at: new Date().toISOString() })
        .eq("id", bid_id)
        .eq("business_id", userData.business_id);
    }

    // Save discovered document links as gem_bid_documents records
    if (doc_links?.length) {
      for (const link of doc_links.slice(0, 10)) {
        const { data: existing } = await serviceSupabase
          .from("gem_bid_documents")
          .select("id")
          .eq("gem_bid_id", bid_id)
          .eq("file_url", link.url)
          .single();

        if (!existing) {
          await serviceSupabase.from("gem_bid_documents").insert({
            gem_bid_id: bid_id,
            doc_type: "tender_document",
            file_name: link.name.substring(0, 200),
            file_url: link.url,
            is_generated: false,
          });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("save-doc error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
