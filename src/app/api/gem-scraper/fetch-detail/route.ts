import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const GEM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

// Extracts text from a PDF buffer using pdf-parse
async function pdfToText(buffer: Buffer): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const result = await pdfParse(buffer);
    return result.text?.replace(/\s{3,}/g, "\n\n").trim().substring(0, 30000) || null;
  } catch {
    return null;
  }
}

// Try to obtain a fresh GeM session cookie for the current request
async function getGemSession(): Promise<string | null> {
  try {
    const res = await fetch("https://bidplus.gem.gov.in/all-bids", {
      headers: GEM_HEADERS,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const cookies = res.headers.getSetCookie?.() ?? [];
    return cookies.map((c: string) => c.split(";")[0]).filter(Boolean).join("; ") || null;
  } catch {
    return null;
  }
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
    if (bid.raw_full_text && bid.raw_full_text.length > 500) {
      return NextResponse.json({ status: "already_fetched", bid_id });
    }

    // Build the bid document URL (PDF)
    const docUrl = bid.bid_url
      ?? `https://bidplus.gem.gov.in/showbidDocument/${bid.gem_bid_id}`;

    // Attempt to fetch the PDF (requires a valid GeM session; may return empty without login)
    const session = await getGemSession();
    const fetchHeaders: Record<string, string> = {
      ...GEM_HEADERS,
      Accept: "application/pdf,*/*",
      Referer: "https://bidplus.gem.gov.in/all-bids",
    };
    if (session) fetchHeaders["Cookie"] = session;

    let fullText: string | null = null;
    try {
      const res = await fetch(docUrl, {
        headers: fetchHeaders,
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        const buffer = Buffer.from(await res.arrayBuffer());

        if (buffer.byteLength > 1000 && contentType.includes("pdf")) {
          fullText = await pdfToText(buffer);
        }
      }
    } catch {
      // Network error — fall through to use existing summary text
    }

    if (!fullText) {
      // PDF unavailable (requires GeM login) — mark with what we have
      return NextResponse.json({
        status: "pdf_unavailable",
        bid_id,
        message: "Full bid spec PDF requires GeM seller account login. Bid summary from listing is available for AI analysis.",
      });
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
