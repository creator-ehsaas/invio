import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { aiVision } from "@/lib/ai-client";

/**
 * OCR for scanned tender documents.
 *
 * Some GeM tenders attach image-only PDFs (scanned/signed copies) that
 * yield no text via pdf-parse. The desktop crawler renders those pages
 * to PNG and sends them here; we transcribe each page with the vision
 * model so specs / estimated value / EMD inside scanned documents still
 * reach the analysis.
 *
 * POST /api/gem-scraper/ocr
 * Body: { bid_id, docs: [{ name, category, pages: ["data:image/png;base64,..."] }] }
 */

const MAX_TOTAL_PAGES = 8; // vision calls are token-expensive — hard cap

const OCR_PROMPT = `This is a scanned page from an Indian government tender document (GeM portal).
Transcribe ALL visible text EXACTLY as printed. Rules:
- Preserve every number, amount (₹), date, percentage, and item code precisely.
- Render tables as one line per row with columns separated by " | ".
- Keep section headings on their own lines.
- Do not summarize, interpret, translate, or skip anything. Output only the transcribed text.
- If part of the page is illegible, write [illegible] for that part.`;

// Same patterns the desktop crawler uses on machine-readable text — scanned
// bids print "Estimated Bid Value" / "EMD Amount" too.
function parseFinancials(text: string) {
  const financials: { estimated_value?: number; emd_amount?: number } = {};
  const est = text.match(
    /Estimated\s+Bid\s+Value[^0-9₹]{0,40}(?:₹|inr|rs\.?)?\s*([\d,]+(?:\.\d+)?)/i
  ) || text.match(
    /(?:estimated\s+(?:total\s+)?(?:bid\s+)?value|bid\s+value|budget|total\s+value)[^:\d\n]{0,20}:?\s*(?:₹|inr|rs\.?)?\s*([\d,]+(?:\.\d+)?)/i
  );
  if (est) {
    const val = parseFloat(est[1].replace(/,/g, ""));
    if (val > 100) financials.estimated_value = val;
  }
  const emd = text.match(/EMD\s+Amount[^0-9]{0,30}([\d,]+(?:\.\d+)?)/i)
    || text.match(/(?:EMD|Earnest\s+Money(?:\s+Deposit)?)\s*:?\s*(?:₹|inr|rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
  if (emd) {
    const val = parseFloat(emd[1].replace(/,/g, ""));
    if (val > 0) financials.emd_amount = val;
  }
  return financials;
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
    const { bid_id, docs } = body as {
      bid_id: string;
      docs: { name: string; category?: string; pages: string[] }[];
    };
    if (!bid_id || !Array.isArray(docs) || !docs.length) {
      return NextResponse.json({ error: "bid_id and docs required" }, { status: 400 });
    }

    // Verify ownership (prevent IDOR)
    const { data: ownBid } = await supabase
      .from("gem_bids")
      .select("id")
      .eq("id", bid_id)
      .eq("business_id", userData.business_id)
      .single();
    if (!ownBid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    let pagesProcessed = 0;
    const results: { name: string; category: string; text: string }[] = [];

    for (const doc of docs.slice(0, 3)) {
      if (pagesProcessed >= MAX_TOTAL_PAGES) break;
      const pageTexts: string[] = [];

      for (const page of (doc.pages || []).slice(0, MAX_TOTAL_PAGES - pagesProcessed)) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(page);
        if (!match) continue;
        pagesProcessed++;
        try {
          const text = await aiVision(match[2], match[1], OCR_PROMPT, {
            temperature: 0,
            maxTokens: 2048,
          });
          if (text.trim()) pageTexts.push(text.trim());
        } catch (err) {
          console.error(`OCR failed for a page of ${doc.name}:`, (err as Error).message);
        }
      }

      if (pageTexts.length) {
        results.push({
          name: doc.name,
          category: doc.category || "specification",
          text: pageTexts.join("\n\n"),
        });
      }
    }

    const combined = results.map((r) => r.text).join("\n");
    return NextResponse.json({
      docs: results,
      financials: parseFinancials(combined),
      pages_processed: pagesProcessed,
    });
  } catch (err: any) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: err.message || "OCR failed" }, { status: 500 });
  }
}
