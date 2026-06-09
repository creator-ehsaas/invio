import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GEM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PAGE_URL = "https://bidplus.gem.gov.in/all-bids";
const API_URL = "https://bidplus.gem.gov.in/all-bids-data";

// Fetch the page to get session cookie + CSRF token
async function getSession(): Promise<{ cookie: string; csrf: string } | null> {
  try {
    const res = await fetch(PAGE_URL, {
      headers: {
        "User-Agent": GEM_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract CSRF token embedded in JS: csrf_bd_gem_nk': '...'
    const csrfMatch = html.match(/csrf_bd_gem_nk['":\s,]+['"]([a-f0-9]{32})['"]/);
    if (!csrfMatch) return null;

    // Collect Set-Cookie headers
    const rawCookies = res.headers.getSetCookie?.() ?? [];
    const cookie = rawCookies
      .map((c: string) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

    return { csrf: csrfMatch[1], cookie };
  } catch {
    return null;
  }
}

interface GemApiDoc {
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
  const bidNumber =
    doc.b_bid_number?.[0] ?? doc.b_bid_number_parent?.[0] ?? null;
  if (!bidNumber) return null;

  const parentId = doc.b_bid_number_parent?.[0];
  const bidUrl = bidNumber
    ? `https://bidplus.gem.gov.in/bid/index/${bidNumber}`
    : null;

  const ministry = doc.ba_official_details_minName?.[0] ?? null;
  const dept = doc.ba_official_details_deptName?.[0] ?? null;
  const department = [ministry, dept].filter(Boolean).join(" – ") || null;

  return {
    gem_bid_id: bidNumber,
    title: doc.bd_category_name?.[0] ?? doc.b_category_name?.[0] ?? bidNumber,
    department,
    quantity: doc.b_total_quantity?.[0]?.toString() ?? null,
    start_date: doc.final_start_date_sort?.[0]?.split("T")[0] ?? null,
    end_date: doc.final_end_date_sort?.[0]?.split("T")[0] ?? null,
    estimated_value: null, // not in listing response; fetched on detail page
    bid_url: bidUrl,
    parent_bid_number: parentId ?? null,
  };
}

async function fetchBidsPage(
  session: { cookie: string; csrf: string },
  keyword: string,
  page: number
): Promise<{ docs: GemApiDoc[]; total: number } | null> {
  const payload = {
    param: { searchBid: keyword, searchType: "fullText" },
    filter: {
      bidStatusType: "ongoing_bids",
      byType: "all",
      highBidValue: "",
      byEndDate: { from: "", to: "" },
      sort: "Bid-End-Date-Oldest",
    },
    page: page > 1 ? page : undefined,
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
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code !== 200) return null;

    const solrResp = data?.response?.response;
    return {
      docs: solrResp?.docs ?? [],
      total: solrResp?.numFound ?? 0,
    };
  } catch {
    return null;
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
    const maxPages: number = Math.min(body.maxPages ?? 2, 5);

    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({ business_id: businessId, scan_type: "manual", status: "running" })
      .select()
      .single();
    scanLogId = scanLog?.id || null;

    // Step 1: get session
    const session = await getSession();
    if (!session) {
      if (scanLogId) {
        await supabase
          .from("gem_scan_logs")
          .update({ status: "failed", error_message: "Could not establish GeM session", duration_ms: Date.now() - startTime })
          .eq("id", scanLogId);
      }
      return NextResponse.json({ status: "failed", error: "Could not reach GeM portal", bids_found: 0, bids_new: 0 }, { status: 502 });
    }

    // Step 2: fetch bids for each keyword (or one blank search if no keywords)
    const searchTerms = keywords.length > 0 ? keywords.slice(0, 3) : [""];
    const allDocs: GemApiDoc[] = [];

    for (const term of searchTerms) {
      for (let page = 1; page <= maxPages; page++) {
        const result = await fetchBidsPage(session, term, page);
        if (!result || result.docs.length === 0) break;
        allDocs.push(...result.docs);
        // No more pages if we got fewer than 10 results
        if (result.docs.length < 10) break;
      }
    }

    // Step 3: convert docs → bid rows, deduplicate
    const uniqueBids = new Map<string, ReturnType<typeof docToBid>>();
    for (const doc of allDocs) {
      const bid = docToBid(doc);
      if (bid && !uniqueBids.has(bid.gem_bid_id)) {
        uniqueBids.set(bid.gem_bid_id, bid);
      }
    }

    // Step 4: filter out already-saved bids
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
          status: "new",
        });
      }
    }

    let insertedBids: any[] = [];
    if (newBids.length > 0) {
      const { data } = await supabase.from("gem_bids").insert(newBids).select("id");
      insertedBids = data || [];
    }

    const durationMs = Date.now() - startTime;
    if (scanLogId) {
      await supabase
        .from("gem_scan_logs")
        .update({ status: "completed", bids_found: uniqueBids.size, bids_new: newBids.length, duration_ms: durationMs })
        .eq("id", scanLogId);
    }

    // Enqueue fetch-detail for new bids (fire & forget)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    for (const inserted of insertedBids.slice(0, 10)) {
      fetch(`${baseUrl}/api/gem-scraper/fetch-detail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ bid_id: inserted.id }),
      }).catch(() => {});
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
