import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Vercel Hobby hard limit: 10 s. Budget:
//   getSession  ≤ 3 s
//   fetchBidsPage ≤ 4 s  (one call, one keyword)
//   DB work     ≤ 2 s
//   Total       ≤ 9 s

const GEM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PAGE_URL = "https://bidplus.gem.gov.in/all-bids";
const API_URL = "https://bidplus.gem.gov.in/all-bids-data";

async function getSession(): Promise<{ cookie: string; csrf: string } | null> {
  try {
    const res = await fetch(PAGE_URL, {
      headers: {
        "User-Agent": GEM_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;

    const html = await res.text();
    const csrfMatch = html.match(/csrf_bd_gem_nk['":\s,]+['"]([a-f0-9]{32})['"]/);
    if (!csrfMatch) return null;

    const rawCookies = res.headers.getSetCookie?.() ?? [];
    const cookie = rawCookies.map((c: string) => c.split(";")[0]).filter(Boolean).join("; ");

    return { csrf: csrfMatch[1], cookie };
  } catch {
    return null;
  }
}

interface GemApiDoc {
  b_id?: number[];
  b_bid_number?: string[];
  b_id_parent?: number[];
  b_bid_number_parent?: string[];
  b_category_name?: string[];
  bd_category_name?: string[];
  b_total_quantity?: number[];
  final_start_date_sort?: string[];
  final_end_date_sort?: string[];
  ba_official_details_minName?: string[];
  ba_official_details_deptName?: string[];
  is_high_value?: boolean[];
}

function docToBid(doc: GemApiDoc) {
  const bidNumber = doc.b_bid_number?.[0] ?? doc.b_bid_number_parent?.[0] ?? null;
  if (!bidNumber) return null;

  const parentBidNumber = doc.b_bid_number_parent?.[0] ?? null;
  const numericId = doc.b_id?.[0] ?? null;
  const parentNumericId = doc.b_id_parent?.[0] ?? null;
  const docId = parentNumericId ?? numericId;
  const bidUrl = docId ? `https://bidplus.gem.gov.in/showbidDocument/${docId}` : null;

  const ministry = doc.ba_official_details_minName?.[0] ?? null;
  const dept = doc.ba_official_details_deptName?.[0] ?? null;
  const department = [ministry, dept].filter(Boolean).join(" – ") || null;

  const title = doc.bd_category_name?.[0] ?? doc.b_category_name?.[0] ?? bidNumber;
  const quantity = doc.b_total_quantity?.[0]?.toString() ?? null;
  const startDate = doc.final_start_date_sort?.[0]?.split("T")[0] ?? null;
  const endDate = doc.final_end_date_sort?.[0]?.split("T")[0] ?? null;

  const rawText = [
    `Bid Number: ${bidNumber}`,
    parentBidNumber && parentBidNumber !== bidNumber ? `Parent Bid: ${parentBidNumber}` : null,
    `Category: ${title}`,
    department ? `Department: ${department}` : null,
    quantity ? `Quantity: ${quantity}` : null,
    startDate ? `Start Date: ${startDate}` : null,
    endDate ? `End Date: ${endDate}` : null,
    doc.is_high_value?.[0] ? "High Value Bid: Yes" : null,
  ].filter(Boolean).join("\n");

  return { gem_bid_id: bidNumber, title, department, quantity, start_date: startDate, end_date: endDate, estimated_value: null, bid_url: bidUrl, raw_full_text: rawText };
}

async function fetchBidsPage(
  session: { cookie: string; csrf: string },
  keyword: string
): Promise<GemApiDoc[]> {
  const payload = {
    param: { searchBid: keyword, searchType: "fullText" },
    filter: {
      bidStatusType: "ongoing_bids",
      byType: "all",
      highBidValue: "",
      byEndDate: { from: "", to: "" },
      sort: "Bid-End-Date-Oldest",
    },
  };

  const body = new URLSearchParams();
  body.set("payload", JSON.stringify(payload));
  body.set("csrf_bd_gem_nk", session.csrf);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "User-Agent": GEM_UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: PAGE_URL,
        Cookie: session.cookie,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (data?.code !== 200) return [];
    return data?.response?.response?.docs ?? [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let scanLogId: string | null = null;

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

    const businessId = userData.business_id;

    const { data: savedConfig } = await supabase
      .from("gem_config")
      .select("keywords, categories")
      .eq("business_id", businessId)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));
    const keywords: string[] = body.keywords ?? savedConfig?.keywords ?? [];

    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({ business_id: businessId, scan_type: "manual", status: "running" })
      .select()
      .single();
    scanLogId = scanLog?.id || null;

    // Get GeM session (3 s budget)
    const session = await getSession();
    if (!session) {
      if (scanLogId) {
        await supabase
          .from("gem_scan_logs")
          .update({ status: "portal_unreachable", duration_ms: Date.now() - startTime })
          .eq("id", scanLogId);
      }
      return NextResponse.json({
        status: "portal_unreachable",
        error: "GeM portal did not respond. Try again in a few minutes.",
        bids_found: 0,
        bids_new: 0,
      });
    }

    // Fetch one page per keyword (4 s budget per call — use only first keyword to stay within 10 s)
    const searchTerms = keywords.length > 0 ? keywords.slice(0, 1) : [""];
    const allDocs: GemApiDoc[] = [];

    for (const term of searchTerms) {
      const docs = await fetchBidsPage(session, term);
      allDocs.push(...docs);
    }

    // Deduplicate by bid number
    const uniqueBids = new Map<string, ReturnType<typeof docToBid>>();
    for (const doc of allDocs) {
      const bid = docToBid(doc);
      if (bid && !uniqueBids.has(bid.gem_bid_id)) uniqueBids.set(bid.gem_bid_id, bid);
    }

    // Filter already-saved bids
    const existingIds: string[] = [];
    if (uniqueBids.size > 0) {
      const { data: existing } = await supabase
        .from("gem_bids")
        .select("gem_bid_id")
        .eq("business_id", businessId)
        .in("gem_bid_id", Array.from(uniqueBids.keys()));
      existing?.forEach((e: any) => existingIds.push(e.gem_bid_id));
    }

    const newBids: any[] = [];
    for (const [bidId, bid] of uniqueBids) {
      if (bid && !existingIds.includes(bidId)) {
        newBids.push({
          business_id: businessId,
          gem_bid_id: bid.gem_bid_id,
          title: bid.title?.substring(0, 500) || "Untitled Bid",
          department: bid.department,
          quantity: bid.quantity,
          estimated_value: bid.estimated_value,
          start_date: bid.start_date,
          end_date: bid.end_date,
          bid_url: bid.bid_url,
          raw_full_text: bid.raw_full_text,
          status: "new",
        });
      }
    }

    if (newBids.length > 0) {
      await supabase.from("gem_bids").insert(newBids);
    }

    const durationMs = Date.now() - startTime;
    if (scanLogId) {
      await supabase
        .from("gem_scan_logs")
        .update({ status: "completed", bids_found: uniqueBids.size, bids_new: newBids.length, duration_ms: durationMs })
        .eq("id", scanLogId);
    }

    return NextResponse.json({
      status: "completed",
      bids_found: uniqueBids.size,
      bids_new: newBids.length,
      duration_ms: durationMs,
      scan_id: scanLogId,
    });
  } catch (error: any) {
    console.error("GeM scan error:", error);
    if (scanLogId) {
      const supabase = await createClient();
      await supabase
        .from("gem_scan_logs")
        .update({ status: "failed", error_message: error.message, duration_ms: Date.now() - startTime })
        .eq("id", scanLogId);
    }
    return NextResponse.json({ status: "failed", error: error.message, bids_found: 0, bids_new: 0 }, { status: 500 });
  }
}
