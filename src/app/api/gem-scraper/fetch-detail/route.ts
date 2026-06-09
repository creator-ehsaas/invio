import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { launchBrowser } from "@/lib/browser";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randomDelay = (min: number, max: number) => delay(min + Math.random() * (max - min));

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
      .select("gem_bid_id, raw_full_text")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();

    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    if (bid.raw_full_text) {
      return NextResponse.json({ status: "already_fetched", bid_id });
    }

    // e.g. GEM/2026/B/12345 → https://bidplus.gem.gov.in/bid/index/GEM/2026/B/12345
    const detailUrl = `https://bidplus.gem.gov.in/bid/index/${bid.gem_bid_id}`;

    const browser = await launchBrowser();

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    let fullText = "";
    try {
      await page.goto(detailUrl, { waitUntil: "networkidle2", timeout: 45000 });
      await randomDelay(1500, 3000);

      fullText = await page.evaluate(() => {
        const remove = document.querySelectorAll("nav, script, style, footer, header, .navbar, .sidebar");
        remove.forEach((el) => el.remove());

        const main = document.querySelector(
          "main, #main-content, .bid-detail, .container, body"
        ) as HTMLElement | null;
        return ((main?.innerText) || document.body.innerText || "")
          .replace(/\s{3,}/g, "\n\n")
          .trim()
          .substring(0, 30000);
      });
    } catch (err: any) {
      await browser.close();
      return NextResponse.json(
        { error: `Failed to fetch bid page: ${err.message}` },
        { status: 500 }
      );
    }

    await browser.close();

    if (!fullText || fullText.length < 100) {
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
