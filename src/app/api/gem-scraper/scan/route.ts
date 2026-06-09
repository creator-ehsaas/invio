import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxy to the Fly.io gem-scraper service (Mumbai region = Indian IP, no geo-block).
// Supabase Edge Functions / Vercel are blocked by GeM portal (non-Indian cloud IPs).
// Fly.io service URL: https://invio-gem-scraper.fly.dev
// Env vars needed: GEM_SCRAPER_URL, GEM_SCRAPER_API_KEY

const SCRAPER_URL =
  process.env.GEM_SCRAPER_URL ?? "https://invio-gem-scraper.fly.dev";
const SCRAPER_API_KEY = process.env.GEM_SCRAPER_API_KEY ?? "";

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

    if (!SCRAPER_API_KEY) {
      return NextResponse.json(
        { error: "GEM_SCRAPER_API_KEY not set. Add it to your Vercel environment variables." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const scraperRes = await fetch(`${SCRAPER_URL}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: userData.business_id,
        keywords: body.keywords,
        max_pages: body.maxPages ?? 3,
        api_key: SCRAPER_API_KEY,
      }),
    });

    const data = await scraperRes.json();
    return NextResponse.json(data, { status: scraperRes.ok ? 200 : scraperRes.status });
  } catch (err: any) {
    console.error("scan proxy error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
