import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Route all GeM requests through an Indian IP proxy to bypass geo-blocking.
// Set GEM_PROXY_URL in Vercel env: http://user:pass@host:port
// Any proxy with Indian datacenter/residential IPs works.
const PROXY_URL = process.env.GEM_PROXY_URL;

async function gemFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (PROXY_URL) {
    // undici is built into Node.js 18+ and supports ProxyAgent
    const { ProxyAgent, fetch: undiciFetch } = await import("undici");
    const dispatcher = new ProxyAgent(PROXY_URL);
    return undiciFetch(url, { ...init, dispatcher } as any) as unknown as Response;
  }
  return fetch(url, init);
}

async function getSession(): Promise<{ csrf: string; cookie: string } | null> {
  try {
    const res = await gemFetch("https://bidplus.gem.gov.in/all-bids", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    const csrfMatch = html.match(/csrf_bd_gem_nk["']\s*:\s*["']([^"']+)["']/);
    const csrf = csrfMatch?.[1];
    if (!csrf) return null;

    const setCookie = res.headers.get("set-cookie") ?? "";
    const cookie = setCookie
      .split(",")
      .map((c) => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");

    return { csrf, cookie };
  } catch {
    return null;
  }
}

async function fetchBidsPage(
  session: { csrf: string; cookie: string },
  keyword: string,
  page: number
): Promise<any[]> {
  try {
    const res = await gemFetch("https://bidplus.gem.gov.in/all-bids-data", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": session.cookie,
        "X-CSRF-TOKEN": session.csrf,
        "Referer": "https://bidplus.gem.gov.in/all-bids",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      body: JSON.stringify({ searchedBid: keyword, page }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data?.data ?? data?.bids ?? (Array.isArray(data) ? data : []);
  } catch {
    return [];
  }
}

function docToRow(doc: any, businessId: string) {
  return {
    business_id: businessId,
    gem_bid_id: doc.bid_number ?? doc.bidNumber ?? doc.BID_NUMBER ?? String(doc.id ?? ""),
    title: doc.bid_title ?? doc.title ?? doc.name ?? "Untitled",
    category: doc.bid_category ?? doc.category ?? null,
    quantity: doc.quantity ? String(doc.quantity) : null,
    uom: doc.uom ?? null,
    department: doc.dep_name ?? doc.department ?? null,
    organization: doc.org_name ?? doc.organization ?? null,
    start_date: doc.start_date ?? null,
    end_date: doc.end_date ?? doc.bidEndDate ?? null,
    estimated_value: doc.est_bid_value ? parseFloat(doc.est_bid_value) || null : null,
    bid_type: doc.bid_type ?? null,
    bid_url: doc.bid_number
      ? `https://bidplus.gem.gov.in/bidlisting/${doc.bid_number}`
      : null,
    raw_full_text: JSON.stringify(doc),
    status: "new" as const,
    scraped_at: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
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

    const body = await request.json().catch(() => ({}));
    const maxPages: number = body.maxPages ?? 2;

    // Fetch keywords from business gem config
    const { data: configData } = await supabase
      .from("gem_configs")
      .select("keywords")
      .eq("business_id", userData.business_id)
      .single();
    const keywords: string[] = configData?.keywords?.length
      ? configData.keywords.slice(0, 3)
      : [""];

    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { status: "portal_unreachable", error: "GeM portal did not respond. Try again in a few minutes." },
        { status: 200 }
      );
    }

    const serviceSupabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let totalFound = 0;
    let totalNew = 0;

    for (const keyword of keywords) {
      for (let page = 1; page <= maxPages; page++) {
        const docs = await fetchBidsPage(session, keyword, page);
        if (!docs.length) break;
        totalFound += docs.length;

        for (const doc of docs) {
          const row = docToRow(doc, userData.business_id);
          if (!row.gem_bid_id) continue;

          const { data: existing } = await serviceSupabase
            .from("gem_bids")
            .select("id")
            .eq("gem_bid_id", row.gem_bid_id)
            .eq("business_id", userData.business_id)
            .single();

          if (!existing) {
            await serviceSupabase.from("gem_bids").insert(row);
            totalNew++;
          }
        }
      }
    }

    return NextResponse.json({
      status: "completed",
      bids_found: totalFound,
      bids_new: totalNew,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("scan error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
