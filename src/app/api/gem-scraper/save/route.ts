import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function docToRow(doc: any, businessId: string) {
  return {
    business_id: businessId,
    gem_bid_id: doc.bid_number ?? doc.bidNumber ?? doc.BID_NUMBER ?? String(doc.id ?? ""),
    title: doc.bid_title ?? doc.title ?? doc.name ?? "Untitled",
    category: doc.bid_category ?? doc.category ?? null,
    quantity: doc.quantity ? String(doc.quantity) : null,
    uom: doc.uom ?? null,
    department: doc.dep_name ?? doc.department ?? null,
    organization: doc.org_name ?? doc.organization ?? null,
    start_date: doc.start_date ?? null,
    end_date: doc.end_date ?? doc.bidEndDate ?? null,
    estimated_value: doc.est_bid_value ? parseFloat(doc.est_bid_value) || null : null,
    bid_type: doc.bid_type ?? null,
    bid_url: doc.bid_number
      ? `https://bidplus.gem.gov.in/bidlisting/${doc.bid_number}`
      : null,
    raw_full_text: JSON.stringify(doc),
    status: "new" as const,
    scraped_at: new Date().toISOString(),
  };
}

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

    const body = await request.json().catch(() => ({}));
    const docs: any[] = body.docs ?? [];

    if (!docs.length) return NextResponse.json({ bids_found: 0, bids_new: 0 });

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let totalNew = 0;
    for (const doc of docs) {
      const row = docToRow(doc, userData.business_id);
      if (!row.gem_bid_id) continue;

      const { data: existing } = await serviceSupabase
        .from("gem_bids")
        .select("id")
        .eq("gem_bid_id", row.gem_bid_id)
        .eq("business_id", userData.business_id)
        .single();

      if (!existing) {
        await serviceSupabase.from("gem_bids").insert(row);
        totalNew++;
      }
    }

    return NextResponse.json({ bids_found: docs.length, bids_new: totalNew });
  } catch (err: any) {
    console.error("save error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
