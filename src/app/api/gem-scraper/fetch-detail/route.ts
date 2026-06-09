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

function extractPageText(html: string): string {
  const $ = cheerio.load(html);

  // Remove boilerplate elements
  $("nav, script, style, footer, header, .navbar, .sidebar, noscript").remove();

  // Prefer main content containers
  const main = $(
    "main, #main-content, .bid-detail, #bidDetailContent, .container-fluid, .container, body"
  ).first();

  const rawText = main.length ? main.text() : $.text();

  return rawText
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .substring(0, 30000);
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

    const body = await request.json();
    const { bid_id } = body as { bid_id: string };
    if (!bid_id) return NextResponse.json({ error: "bid_id required" }, { status: 400 });

    const { data: bid } = await supabase
      .from("gem_bids")
      .select("gem_bid_id, bid_url, raw_full_text")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();

    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });
    if (bid.raw_full_text) return NextResponse.json({ status: "already_fetched", bid_id });

    // Build detail URL: use stored bid_url or construct from gem_bid_id
    const detailUrl =
      bid.bid_url ||
      `https://bidplus.gem.gov.in/bid/index/${bid.gem_bid_id}`;

    let html: string;
    try {
      const res = await fetch(detailUrl, {
        headers: GEM_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `GeM portal returned HTTP ${res.status}` },
          { status: 502 }
        );
      }
      html = await res.text();
    } catch (err: any) {
      return NextResponse.json(
        { error: `Network error fetching bid page: ${err.message}` },
        { status: 502 }
      );
    }

    if (
      html.includes("captcha") ||
      html.includes("verify you are human") ||
      html.includes("Access Denied")
    ) {
      return NextResponse.json({ error: "CAPTCHA or access block encountered" }, { status: 429 });
    }

    const fullText = extractPageText(html);

    if (fullText.length < 100) {
      return NextResponse.json({ error: "Bid page returned empty content" }, { status: 422 });
    }

    await supabase
      .from("gem_bids")
      .update({ raw_full_text: fullText, updated_at: new Date().toISOString() })
      .eq("id", bid_id);

    return NextResponse.json({ status: "fetched", bid_id, text_length: fullText.length });
  } catch (err: any) {
    console.error("fetch-detail error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
