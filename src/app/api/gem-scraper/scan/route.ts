import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Thin proxy to the Supabase Edge Function `gem-scan`.
// Responsibility here: auth check + get business_id. Heavy lifting is in the Edge Function
// which runs on Supabase's infrastructure with a 150 s timeout (vs Vercel Hobby's 10 s).

const EDGE_FUNCTION_URL = process.env.SUPABASE_GEM_SCAN_URL
  ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gem-scan`;

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

    const body = await request.json().catch(() => ({}));

    // Delegate to Edge Function — it has a 150 s timeout
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY not set. Add it to your environment variables." },
        { status: 500 }
      );
    }

    const edgeRes = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        business_id: userData.business_id,
        keywords: body.keywords,
        max_pages: body.maxPages ?? 3,
      }),
    });

    const data = await edgeRes.json();
    return NextResponse.json(data, { status: edgeRes.ok ? 200 : edgeRes.status });
  } catch (err: any) {
    console.error("scan proxy error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}
