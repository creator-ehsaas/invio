import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as cheerio from "cheerio";

const GEM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

function parseDateDMY(d: string | undefined | null): string | null {
  if (!d) return null;
  const parts = d.trim().split(/[-/]/);
  if (parts.length !== 3) return null;
  // DD-MM-YYYY → YYYY-MM-DD
  if (parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  // YYYY-MM-DD already
  if (parts[0].length === 4) return d.trim();
  return null;
}

function parseValue(text: string): number | null {
  const m = text.match(/[\d,]+(?:\.\d{2})?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function extractBidsFromHTML(html: string): any[] {
  const $ = cheerio.load(html);
  const bids: any[] = [];

  // GeM portal uses different DOM structures — try several patterns
  const bidIdRegex = /GEM\/\d{4}\/[A-Z]\/\d+/g;

  // Pattern 1: block_m divs (most common on bidplus.gem.gov.in)
  $(".block_m, .bid-listing-card, .card.bid-card, tr.bid-row").each(
    (_i, el) => {
      const text = $(el).text();
      const idMatch = text.match(/GEM\/\d{4}\/[A-Z]\/\d+/);
      if (!idMatch) return;

      const deptMatch = text.match(
        /(?:Buyer|Department|Ministry|Organization)[:\s]*([^\n]+)/i
      );
      const qtyMatch = text.match(/(?:Quantity|Qty)[:\s]*([\d,]+)/i);
      const dateMatches = text.match(/\d{2}[-/]\d{2}[-/]\d{4}/g) || [];
      const valueMatch = text.match(
        /(?:₹|Rs\.?|INR)[^\d]*([\d,]+(?:\.\d{2})?)/
      );
      const link = $(el).find("a[href*='bid']").first().attr("href");

      bids.push({
        gem_bid_id: idMatch[0],
        title: $(el)
          .find("h5, h4, .bid-title, [class*='title']")
          .first()
          .text()
          .trim()
          .substring(0, 500) || text.split("\n").find((l) => l.trim().length > 20)?.trim()?.substring(0, 500) || idMatch[0],
        department: deptMatch ? deptMatch[1].trim().substring(0, 200) : null,
        quantity: qtyMatch ? qtyMatch[1].replace(/,/g, "") : null,
        start_date: parseDateDMY(dateMatches[0]),
        end_date: parseDateDMY(dateMatches[1]),
        estimated_value: valueMatch ? parseValue(valueMatch[1]) : null,
        bid_url: link
          ? link.startsWith("http")
            ? link
            : `https://bidplus.gem.gov.in${link}`
          : null,
      });
    }
  );

  // Pattern 2: plain text scan for bid IDs not caught by selectors
  if (bids.length === 0) {
    const allText = $.text();
    const ids = [...new Set(allText.match(bidIdRegex) || [])];
    ids.forEach((id) => {
      bids.push({ gem_bid_id: id, title: id, department: null, quantity: null, start_date: null, end_date: null, estimated_value: null, bid_url: null });
    });
  }

  return bids;
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
    const maxPages: number = Math.min(body.maxPages ?? 3, 5);

    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({ business_id: businessId, scan_type: "manual", status: "running" })
      .select()
      .single();
    scanLogId = scanLog?.id || null;

    const allBids: any[] = [];

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const searchParam = keywords.length > 0
        ? `?searchText=${encodeURIComponent(keywords[0])}&page=${pageNum + 1}`
        : pageNum > 0 ? `?page=${pageNum + 1}` : "";
      const url = `https://bidplus.gem.gov.in/all-bids${searchParam}`;

      let html: string;
      try {
        const res = await fetch(url, {
          headers: GEM_HEADERS,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) break;
        html = await res.text();
      } catch {
        break;
      }

      // Detect CAPTCHA or login wall
      if (
        html.includes("captcha") ||
        html.includes("verify you are human") ||
        html.includes("Access Denied")
      ) {
        if (scanLogId) {
          await supabase
            .from("gem_scan_logs")
            .update({ status: "captcha_blocked", duration_ms: Date.now() - startTime })
            .eq("id", scanLogId);
        }
        return NextResponse.json({
          status: "captcha_blocked",
          bids_found: 0,
          bids_new: 0,
          duration_ms: Date.now() - startTime,
        });
      }

      const pageBids = extractBidsFromHTML(html);
      allBids.push(...pageBids);

      // Stop if this page had no bids (last page)
      if (pageBids.length === 0) break;
    }

    // Deduplicate
    const uniqueBids = new Map<string, any>();
    allBids.forEach((bid) => {
      if (bid.gem_bid_id) uniqueBids.set(bid.gem_bid_id, bid);
    });

    // Find existing
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
      if (!existingIds.includes(bidId)) {
        newBids.push({
          business_id: businessId,
          gem_bid_id: bidId,
          title: bid.title || "Untitled Bid",
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

    // Enqueue fetch-detail for new bids (fire & forget, best-effort)
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
