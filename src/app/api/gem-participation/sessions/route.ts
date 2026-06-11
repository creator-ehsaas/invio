import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog, serviceClient } from "@/lib/gem-audit";
import { getAuthContext, getOwnedSession } from "@/lib/gem-participation";

/**
 * GeM participation sessions.
 *
 * POST   — create a session for a bid (status: draft)
 * GET    — ?id=<session_id> returns one session with fields + documents
 *          ?bid_id=<bid_id> lists sessions for a bid
 */

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { bid_id } = await request.json();
    if (!bid_id) return NextResponse.json({ error: "bid_id is required" }, { status: 400 });

    const supabase = serviceClient();
    const { data: bid } = await supabase
      .from("gem_bids")
      .select("id, gem_bid_id, title, status, end_date, ai_summary")
      .eq("id", bid_id)
      .eq("business_id", auth.businessId)
      .maybeSingle();
    if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

    if (bid.end_date && new Date(bid.end_date).getTime() < Date.now()) {
      return NextResponse.json({ error: "This bid has already closed" }, { status: 422 });
    }
    if (!bid.ai_summary) {
      return NextResponse.json(
        { error: "Run Fetch & Analyze on this bid first — participation needs the analyzed requirements." },
        { status: 422 }
      );
    }

    // Resume an existing active session instead of creating duplicates
    const { data: existing } = await supabase
      .from("gem_participation_sessions")
      .select("*")
      .eq("bid_id", bid_id)
      .eq("business_id", auth.businessId)
      .not("status", "in", '("submitted","failed","cancelled")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return NextResponse.json({ session: existing, resumed: true });

    const { data: session, error } = await supabase
      .from("gem_participation_sessions")
      .insert({
        business_id: auth.businessId,
        bid_id,
        status: "draft",
        created_by: auth.userId,
      })
      .select()
      .single();
    if (error || !session) {
      return NextResponse.json({ error: error?.message || "Failed to create session" }, { status: 500 });
    }

    await writeAuditLog({
      businessId: auth.businessId,
      sessionId: session.id,
      actor: "user",
      actorUserId: auth.userId,
      action: "session_created",
      payload: { bid_id, gem_bid_id: bid.gem_bid_id, bid_title: bid.title },
    });

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error("gem-participation sessions error:", error);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = serviceClient();
    const sessionId = request.nextUrl.searchParams.get("id");
    const bidId = request.nextUrl.searchParams.get("bid_id");

    if (sessionId) {
      const session = await getOwnedSession(auth.businessId, sessionId);
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

      const [{ data: fields }, { data: docs }] = await Promise.all([
        supabase.from("gem_participation_fields").select("*").eq("session_id", sessionId).order("created_at"),
        supabase.from("gem_participation_documents").select("*").eq("session_id", sessionId).order("created_at"),
      ]);
      return NextResponse.json({ session, fields: fields || [], documents: docs || [] });
    }

    if (bidId) {
      const { data: sessions } = await supabase
        .from("gem_participation_sessions")
        .select("*")
        .eq("bid_id", bidId)
        .eq("business_id", auth.businessId)
        .order("created_at", { ascending: false });
      return NextResponse.json({ sessions: sessions || [] });
    }

    return NextResponse.json({ error: "id or bid_id is required" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
