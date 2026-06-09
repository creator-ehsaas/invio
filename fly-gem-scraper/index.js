import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const GEM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE_URL = "https://bidplus.gem.gov.in/all-bids";
const API_URL  = "https://bidplus.gem.gov.in/all-bids-data";

// ── GeM helpers ───────────────────────────────────────────────────────────────

async function getSession() {
  const res = await fetch(PAGE_URL, {
    headers: {
      "User-Agent": GEM_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;

  const html = await res.text();
  const csrfMatch = html.match(/csrf_bd_gem_nk['":\s,]+['"]([a-f0-9]{32})['"]/);
  if (!csrfMatch) return null;

  const rawCookies = res.headers.getSetCookie?.() ?? [];
  const cookie = rawCookies.map(c => c.split(";")[0]).filter(Boolean).join("; ");
  return { csrf: csrfMatch[1], cookie };
}

async function fetchBidsPage(session, keyword, page = 1) {
  const payload = {
    param: { searchBid: keyword, searchType: "fullText" },
    filter: { bidStatusType: "ongoing_bids", byType: "all", highBidValue: "", byEndDate: { from: "", to: "" }, sort: "Bid-End-Date-Oldest" },
    ...(page > 1 ? { page } : {}),
  };

  const body = new URLSearchParams();
  body.set("payload", JSON.stringify(payload));
  body.set("csrf_bd_gem_nk", session.csrf);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "User-Agent": GEM_UA,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: PAGE_URL,
      Cookie: session.cookie,
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  if (data?.code !== 200) return [];
  return data?.response?.response?.docs ?? [];
}

function docToBid(doc) {
  const bidNumber = doc.b_bid_number?.[0] ?? doc.b_bid_number_parent?.[0] ?? null;
  if (!bidNumber) return null;

  const parentBidNumber = doc.b_bid_number_parent?.[0] ?? null;
  const docId = doc.b_id_parent?.[0] ?? doc.b_id?.[0] ?? null;

  const ministry = doc.ba_official_details_minName?.[0] ?? null;
  const dept     = doc.ba_official_details_deptName?.[0] ?? null;
  const department = [ministry, dept].filter(Boolean).join(" – ") || null;

  const title     = doc.bd_category_name?.[0] ?? doc.b_category_name?.[0] ?? bidNumber;
  const quantity  = doc.b_total_quantity?.[0]?.toString() ?? null;
  const startDate = doc.final_start_date_sort?.[0]?.split("T")[0] ?? null;
  const endDate   = doc.final_end_date_sort?.[0]?.split("T")[0] ?? null;

  const rawText = [
    `Bid Number: ${bidNumber}`,
    parentBidNumber && parentBidNumber !== bidNumber ? `Parent Bid: ${parentBidNumber}` : null,
    `Category: ${title}`,
    department ? `Department: ${department}` : null,
    quantity   ? `Quantity: ${quantity}`     : null,
    startDate  ? `Start Date: ${startDate}`  : null,
    endDate    ? `End Date: ${endDate}`      : null,
    doc.is_high_value?.[0] ? "High Value Bid: Yes" : null,
  ].filter(Boolean).join("\n");

  return {
    gem_bid_id: bidNumber,
    title,
    department,
    quantity,
    start_date: startDate,
    end_date: endDate,
    bid_url: docId ? `https://bidplus.gem.gov.in/showbidDocument/${docId}` : null,
    raw_full_text: rawText,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

app.post("/scan", async (req, res) => {
  const startTime = Date.now();
  const { business_id, keywords = [], max_pages = 3, api_key } = req.body;

  // Simple API key guard
  if (api_key !== process.env.SCRAPER_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!business_id) {
    return res.status(400).json({ error: "business_id required" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  let scanLogId = null;
  try {
    const { data: scanLog } = await supabase
      .from("gem_scan_logs")
      .insert({ business_id, scan_type: "manual", status: "running" })
      .select().single();
    scanLogId = scanLog?.id ?? null;

    const session = await getSession();
    if (!session) {
      if (scanLogId) await supabase.from("gem_scan_logs").update({ status: "portal_unreachable", duration_ms: Date.now() - startTime }).eq("id", scanLogId);
      return res.json({ status: "portal_unreachable", error: "GeM portal did not respond.", bids_found: 0, bids_new: 0 });
    }

    const searchTerms = keywords.length > 0 ? keywords.slice(0, 3) : [""];
    const pages = Math.min(max_pages, 5);
    const allDocs = [];

    for (const term of searchTerms) {
      for (let page = 1; page <= pages; page++) {
        const docs = await fetchBidsPage(session, term, page);
        allDocs.push(...docs);
        if (docs.length < 10) break;
      }
    }

    const uniqueBids = new Map();
    for (const doc of allDocs) {
      const bid = docToBid(doc);
      if (bid && !uniqueBids.has(bid.gem_bid_id)) uniqueBids.set(bid.gem_bid_id, bid);
    }

    const existingIds = [];
    if (uniqueBids.size > 0) {
      const { data: existing } = await supabase
        .from("gem_bids").select("gem_bid_id")
        .eq("business_id", business_id)
        .in("gem_bid_id", Array.from(uniqueBids.keys()));
      existing?.forEach(e => existingIds.push(e.gem_bid_id));
    }

    const newBids = [];
    for (const [bidId, bid] of uniqueBids) {
      if (!existingIds.includes(bidId)) {
        newBids.push({ business_id, gem_bid_id: bid.gem_bid_id, title: bid.title?.substring(0, 500) || "Untitled", department: bid.department, quantity: bid.quantity, estimated_value: null, start_date: bid.start_date, end_date: bid.end_date, bid_url: bid.bid_url, raw_full_text: bid.raw_full_text, status: "new" });
      }
    }

    if (newBids.length > 0) await supabase.from("gem_bids").insert(newBids);

    const durationMs = Date.now() - startTime;
    if (scanLogId) await supabase.from("gem_scan_logs").update({ status: "completed", bids_found: uniqueBids.size, bids_new: newBids.length, duration_ms: durationMs }).eq("id", scanLogId);

    return res.json({ status: "completed", bids_found: uniqueBids.size, bids_new: newBids.length, duration_ms: durationMs });
  } catch (err) {
    console.error("scan error:", err);
    if (scanLogId) await supabase.from("gem_scan_logs").update({ status: "failed", error_message: err.message, duration_ms: Date.now() - startTime }).eq("id", scanLogId).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`gem-scraper listening on ${PORT}`));
