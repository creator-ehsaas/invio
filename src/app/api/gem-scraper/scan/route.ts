import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GeM Bid Scraper — Scans bidplus.gem.gov.in for new bids.
 * Uses Puppeteer with stealth plugin to avoid bot detection.
 * 
 * POST /api/gem-scraper/scan
 * Body: { keywords?: string[], categories?: string[], maxPages?: number }
 */

// Delay helper for human-like behavior
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let scanLogId: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from("users")
      .select("business_id")
      .eq("id", user.id)
      .single();

    if (!userData?.business_id) {
      return NextResponse.json({ error: "No business profile found" }, { status: 400 });
    }

    const businessId = userData.business_id;
    const body = await request.json().catch(() => ({}));
    const { keywords = [], categories = [], maxPages = 3 } = body;

    // Create scan log entry
    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({
        business_id: businessId,
        scan_type: "manual",
        status: "running",
      })
      .select()
      .single();

    scanLogId = scanLog?.id || null;

    // Dynamic import of puppeteer (server-side only)
    let browser;
    try {
      const puppeteerExtra = await import("puppeteer-extra");
      const StealthPlugin = await import("puppeteer-extra-plugin-stealth");
      
      const puppeteer = puppeteerExtra.default;
      puppeteer.use(StealthPlugin.default());

      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--window-size=1920,1080",
        ],
      });
    } catch (launchErr: any) {
      // Fallback: try regular puppeteer if puppeteer-extra fails
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.default.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--window-size=1920,1080",
        ],
      });
    }

    const page = await browser.newPage();
    
    // Set realistic viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set extra headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    // Navigate to GeM bids page
    const gemUrl = "https://bidplus.gem.gov.in/all-bids";
    await page.goto(gemUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await randomDelay(2000, 4000);

    // Check for CAPTCHA
    const hasCaptcha = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase();
      return (
        body.includes("captcha") ||
        body.includes("verify you are human") ||
        body.includes("i am not a robot") ||
        !!document.querySelector("iframe[src*='recaptcha']") ||
        !!document.querySelector(".g-recaptcha")
      );
    });

    if (hasCaptcha) {
      // Take screenshot for user
      const screenshot = await page.screenshot({ encoding: "base64" });
      await browser.close();

      if (scanLogId) {
        await supabase
          .from("gem_scan_logs")
          .update({
            status: "captcha_blocked",
            error_message: "CAPTCHA detected. Please solve it manually.",
            duration_ms: Date.now() - startTime,
          })
          .eq("id", scanLogId);
      }

      return NextResponse.json({
        status: "captcha_blocked",
        bids_found: 0,
        bids_new: 0,
        duration_ms: Date.now() - startTime,
        captcha_screenshot: screenshot,
        error: "CAPTCHA detected on GeM portal. The bot cannot proceed automatically.",
      });
    }

    // Apply keyword search if provided
    if (keywords.length > 0) {
      try {
        const searchInput = await page.$('input[type="search"], input[name="searchBid"], input[placeholder*="Search"], #search_bid');
        if (searchInput) {
          await searchInput.click({ clickCount: 3 });
          await searchInput.type(keywords.join(" "), { delay: 50 });
          await randomDelay(500, 1000);
          
          // Try pressing Enter or clicking search button
          await page.keyboard.press("Enter");
          await randomDelay(3000, 5000);
        }
      } catch {
        // Search input not found, proceed without filtering
      }
    }

    // Scrape bid listings
    const allBids: any[] = [];

    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      await randomDelay(2000, 4000);

      // Extract bid cards from the current page
      const pageBids = await page.evaluate(() => {
        const bids: any[] = [];

        // Try multiple selector strategies since GeM updates its DOM regularly
        const bidCards = document.querySelectorAll(
          '.bid-listing-card, .card.bid-card, [class*="bid-list"], table tbody tr, .block_m'
        );

        bidCards.forEach((card) => {
          try {
            const text = card.textContent || "";
            
            // Extract bid number — pattern: GEM/YYYY/B/NNNNNNN
            const bidMatch = text.match(/GEM\/\d{4}\/[A-Z]\/\d+/);
            if (!bidMatch) return;

            const bidId = bidMatch[0];

            // Extract title
            const titleEl = card.querySelector(
              'h5, h4, .bid-title, [class*="title"], td:nth-child(2)'
            );
            const title = titleEl?.textContent?.trim() || "";

            // Extract department
            const deptMatch = text.match(/(?:Department|Ministry|Organization|Buyer)[:\s]*([^\n,]+)/i);
            const department = deptMatch ? deptMatch[1].trim() : null;

            // Extract quantity
            const qtyMatch = text.match(/(?:Quantity|Qty)[:\s]*(\d[\d,]*)/i);
            const quantity = qtyMatch ? qtyMatch[1].replace(/,/g, "") : null;

            // Extract dates
            const dateRegex = /(\d{2}[-/]\d{2}[-/]\d{4})/g;
            const dates = text.match(dateRegex) || [];

            // Extract estimated value
            const valueMatch = text.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)/);
            const estimatedValue = valueMatch
              ? parseFloat(valueMatch[1].replace(/,/g, ""))
              : null;

            // Extract bid URL
            const linkEl = card.querySelector("a[href*='bid']") as HTMLAnchorElement;
            const bidUrl = linkEl?.href || null;

            bids.push({
              gem_bid_id: bidId,
              title: title.substring(0, 500),
              department,
              quantity,
              start_date: dates[0] || null,
              end_date: dates[1] || null,
              estimated_value: estimatedValue,
              bid_url: bidUrl,
            });
          } catch {
            // Skip malformed cards
          }
        });

        return bids;
      });

      allBids.push(...pageBids);

      // Try to navigate to next page
      if (pageNum < maxPages - 1) {
        try {
          const nextBtn = await page.$(
            'a[rel="next"], .pagination .next a, button.next-page, [aria-label="Next"]'
          );
          if (nextBtn) {
            await nextBtn.click();
            await randomDelay(3000, 5000);
          } else {
            break; // No more pages
          }
        } catch {
          break;
        }
      }
    }

    await browser.close();

    // Deduplicate bids by gem_bid_id
    const uniqueBids = new Map<string, any>();
    allBids.forEach((bid) => {
      if (bid.gem_bid_id && !uniqueBids.has(bid.gem_bid_id)) {
        uniqueBids.set(bid.gem_bid_id, bid);
      }
    });

    // Check which bids are new (not already in database)
    const existingBidIds: string[] = [];
    if (uniqueBids.size > 0) {
      const { data: existing } = await supabase
        .from("gem_bids")
        .select("gem_bid_id")
        .eq("business_id", businessId)
        .in("gem_bid_id", Array.from(uniqueBids.keys()));

      if (existing) {
        existing.forEach((e: any) => existingBidIds.push(e.gem_bid_id));
      }
    }

    // Insert new bids
    const newBids: any[] = [];
    for (const [bidId, bid] of uniqueBids) {
      if (!existingBidIds.includes(bidId)) {
        // Parse dates from DD-MM-YYYY to ISO
        let startDate = null;
        let endDate = null;
        
        if (bid.start_date) {
          const parts = bid.start_date.split(/[-/]/);
          if (parts.length === 3) {
            startDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
        if (bid.end_date) {
          const parts = bid.end_date.split(/[-/]/);
          if (parts.length === 3) {
            endDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }

        newBids.push({
          business_id: businessId,
          gem_bid_id: bidId,
          title: bid.title || "Untitled Bid",
          department: bid.department,
          quantity: bid.quantity,
          estimated_value: bid.estimated_value,
          start_date: startDate,
          end_date: endDate,
          bid_url: bid.bid_url,
          status: "new",
        });
      }
    }

    if (newBids.length > 0) {
      await supabase.from("gem_bids").insert(newBids);
    }

    const durationMs = Date.now() - startTime;

    // Update scan log
    if (scanLogId) {
      await supabase
        .from("gem_scan_logs")
        .update({
          status: "completed",
          bids_found: uniqueBids.size,
          bids_new: newBids.length,
          duration_ms: durationMs,
        })
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

    // Update scan log on failure
    if (scanLogId) {
      const supabase = await createClient();
      await supabase
        .from("gem_scan_logs")
        .update({
          status: "failed",
          error_message: error.message || "Unknown error",
          duration_ms: Date.now() - startTime,
        })
        .eq("id", scanLogId);
    }

    return NextResponse.json(
      {
        status: "failed",
        error: error.message || "Scan failed",
        bids_found: 0,
        bids_new: 0,
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
