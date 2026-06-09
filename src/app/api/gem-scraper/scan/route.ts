import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { launchBrowser } from "@/lib/browser";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

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

    // Load saved config for keywords/categories
    const { data: savedConfig } = await supabase
      .from("gem_config")
      .select("keywords, categories")
      .eq("business_id", businessId)
      .maybeSingle();

    const body = await request.json().catch(() => ({}));
    const keywords: string[] = body.keywords ?? savedConfig?.keywords ?? [];
    const categories: string[] = body.categories ?? savedConfig?.categories ?? [];
    const maxPages: number = body.maxPages ?? 3;

    void categories; // used in future filtering

    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({ business_id: businessId, scan_type: "manual", status: "running" })
      .select()
      .single();
    scanLogId = scanLog?.id || null;

    const browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    const searchParam = keywords.length > 0
      ? `?searchText=${encodeURIComponent(keywords[0])}`
      : "";
    const gemUrl = `https://bidplus.gem.gov.in/all-bids${searchParam}`;

    await page.goto(gemUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await randomDelay(2000, 4000);

    const hasCaptcha = await page.evaluate(() => {
      const body = (document.body as HTMLElement).innerText.toLowerCase();
      return (
        body.includes("captcha") ||
        body.includes("verify you are human") ||
        !!document.querySelector("iframe[src*='recaptcha']") ||
        !!document.querySelector(".g-recaptcha")
      );
    });

    if (hasCaptcha) {
      const screenshot = await page.screenshot({ encoding: "base64" });
      await browser.close();
      if (scanLogId) await supabase.from("gem_scan_logs").update({ status: "captcha_blocked", duration_ms: Date.now() - startTime }).eq("id", scanLogId);
      return NextResponse.json({ status: "captcha_blocked", bids_found: 0, bids_new: 0, duration_ms: Date.now() - startTime, captcha_screenshot: screenshot });
    }

    const allBids: any[] = [];
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      await randomDelay(2000, 4000);

      const pageBids = await page.evaluate(() => {
        const bids: any[] = [];
        const bidCards = document.querySelectorAll(
          ".bid-listing-card, .card.bid-card, [class*=\"bid-list\"], table tbody tr, .block_m"
        );
        bidCards.forEach((card) => {
          try {
            const text = (card as HTMLElement).innerText || card.textContent || "";
            const bidMatch = text.match(/GEM\/\d{4}\/[A-Z]\/\d+/);
            if (!bidMatch) return;
            const bidId = bidMatch[0];
            const titleEl = card.querySelector("h5, h4, .bid-title, [class*=\"title\"], td:nth-child(2)");
            const title = (titleEl as HTMLElement)?.innerText?.trim() || "";
            const deptMatch = text.match(/(?:Department|Ministry|Organization|Buyer)[:\s]*([^\n,]+)/i);
            const qtyMatch = text.match(/(?:Quantity|Qty)[:\s]*(\d[\d,]*)/i);
            const dateRegex = /(\d{2}[-/]\d{2}[-/]\d{4})/g;
            const dates = text.match(dateRegex) || [];
            const valueMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)/);
            const linkEl = card.querySelector("a[href*='bid']") as HTMLAnchorElement | null;
            bids.push({
              gem_bid_id: bidId,
              title: title.substring(0, 500),
              department: deptMatch ? deptMatch[1].trim() : null,
              quantity: qtyMatch ? qtyMatch[1].replace(/,/g, "") : null,
              start_date: dates[0] || null,
              end_date: dates[1] || null,
              estimated_value: valueMatch ? parseFloat(valueMatch[1].replace(/,/g, "")) : null,
              bid_url: linkEl?.href || null,
            });
          } catch { /* skip malformed */ }
        });
        return bids;
      });
      allBids.push(...pageBids);

      if (pageNum < maxPages - 1) {
        try {
          const nextBtn = await page.$("a[rel=\"next\"], .pagination .next a, button.next-page, [aria-label=\"Next\"]");
          if (nextBtn) { await nextBtn.click(); await randomDelay(3000, 5000); }
          else break;
        } catch { break; }
      }
    }

    await browser.close();

    const uniqueBids = new Map<string, any>();
    allBids.forEach((bid) => { if (bid.gem_bid_id) uniqueBids.set(bid.gem_bid_id, bid); });

    const existingIds: string[] = [];
    if (uniqueBids.size > 0) {
      const { data: existing } = await supabase
        .from("gem_bids").select("gem_bid_id")
        .eq("business_id", businessId)
        .in("gem_bid_id", Array.from(uniqueBids.keys()));
      existing?.forEach((e: any) => existingIds.push(e.gem_bid_id));
    }

    const newBids: any[] = [];
    for (const [bidId, bid] of uniqueBids) {
      if (existingIds.includes(bidId)) continue;
      const parseDate = (d: string | null) => {
        if (!d) return null;
        const parts = d.split(/[-/]/);
        return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : null;
      };
      newBids.push({
        business_id: businessId,
        gem_bid_id: bidId,
        title: bid.title || "Untitled Bid",
        department: bid.department,
        quantity: bid.quantity,
        estimated_value: bid.estimated_value,
        start_date: parseDate(bid.start_date),
        end_date: parseDate(bid.end_date),
        bid_url: bid.bid_url,
        status: "new",
      });
    }

    let insertedBids: any[] = [];
    if (newBids.length > 0) {
      const { data } = await supabase.from("gem_bids").insert(newBids).select("id");
      insertedBids = data || [];
    }

    const durationMs = Date.now() - startTime;
    if (scanLogId) {
      await supabase.from("gem_scan_logs").update({
        status: "completed",
        bids_found: uniqueBids.size,
        bids_new: newBids.length,
        duration_ms: durationMs,
      }).eq("id", scanLogId);
    }

    // Fire-and-forget fetch-detail for up to 10 new bids
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    for (const inserted of insertedBids.slice(0, 10)) {
      fetch(`${baseUrl}/api/gem-scraper/fetch-detail`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ bid_id: inserted.id }),
      }).catch(() => { /* background — ignore failures */ });
      await delay(500);
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
      await supabase.from("gem_scan_logs").update({ status: "failed", error_message: error.message, duration_ms: Date.now() - startTime }).eq("id", scanLogId);
    }
    return NextResponse.json({ status: "failed", error: error.message, bids_found: 0, bids_new: 0 }, { status: 500 });
  }
}
