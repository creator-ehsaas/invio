import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function docToRow(doc: any, businessId: string) {
  const bidNumber = doc.b_bid_number?.[0] ?? doc.b_bid_number_parent?.[0] ?? null;
  if (!bidNumber) return null;

  const ministry = doc.ba_official_details_minName?.[0] ?? null;
  const dept = doc.ba_official_details_deptName?.[0] ?? null;
  const department = [ministry, dept].filter(Boolean).join(" – ") || null;
  const title = doc.bd_category_name?.[0] ?? doc.b_category_name?.[0] ?? bidNumber;
  const docId = doc.b_id_parent?.[0] ?? doc.b_id?.[0] ?? null;
  const startDate = doc.final_start_date_sort?.[0]?.split("T")[0] ?? null;
  const endDate = doc.final_end_date_sort?.[0]?.split("T")[0] ?? null;

  const rawText = [
    `Bid Number: ${bidNumber}`,
    `Category: ${title}`,
    department ? `Department: ${department}` : null,
    doc.b_total_quantity?.[0] ? `Quantity: ${doc.b_total_quantity[0]}` : null,
    startDate ? `Start Date: ${startDate}` : null,
    endDate ? `End Date: ${endDate}` : null,
  ].filter(Boolean).join("\n");

  return {
    business_id: businessId,
    gem_bid_id: bidNumber,
    title: title.substring(0, 500),
    category: doc.b_category_name?.[0] ?? null,
    quantity: doc.b_total_quantity?.[0]?.toString() ?? null,
    department,
    start_date: startDate,
    end_date: endDate,
    bid_url: docId ? `https://bidplus.gem.gov.in/showbidDocument/${docId}` : null,
    raw_full_text: rawText,
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

    // Deduplicate by gem_bid_id
    const rowMap = new Map<string, any>();
    for (const doc of docs) {
      const row = docToRow(doc, userData.business_id);
      if (row && !rowMap.has(row.gem_bid_id)) rowMap.set(row.gem_bid_id, row);
    }

    // Fetch existing IDs in one query
    const { data: existing } = await serviceSupabase
      .from("gem_bids")
      .select("gem_bid_id")
      .eq("business_id", userData.business_id)
      .in("gem_bid_id", Array.from(rowMap.keys()));
    const existingIds = new Set((existing ?? []).map((e: any) => e.gem_bid_id));

    const newRows = Array.from(rowMap.values()).filter((r) => !existingIds.has(r.gem_bid_id));
    if (newRows.length > 0) await serviceSupabase.from("gem_bids").insert(newRows);
    const totalNew = newRows.length;

    return NextResponse.json({ bids_found: docs.length, bids_new: totalNew });
  } catch (err: any) {
    console.error("save error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
