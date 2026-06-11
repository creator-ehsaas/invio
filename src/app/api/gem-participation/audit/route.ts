import { NextRequest, NextResponse } from "next/server";
import { serviceClient, verifyAuditChain } from "@/lib/gem-audit";
import { getAuthContext, getOwnedSession } from "@/lib/gem-participation";

/**
 * Audit trail access and export.
 *
 * GET /api/gem-participation/audit?session_id=<id>[&format=csv][&verify=1]
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const sessionId = request.nextUrl.searchParams.get("session_id");
    if (!sessionId) return NextResponse.json({ error: "session_id is required" }, { status: 400 });

    const session = await getOwnedSession(auth.businessId, sessionId);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const supabase = serviceClient();
    const { data: logs } = await supabase
      .from("gem_audit_logs")
      .select("id, actor, actor_user_id, action, payload, payload_hash, prev_hash, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const chain = request.nextUrl.searchParams.get("verify")
      ? await verifyAuditChain(sessionId)
      : undefined;

    if (request.nextUrl.searchParams.get("format") === "csv") {
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = [
        ["timestamp", "actor", "action", "payload", "payload_hash", "prev_hash"].join(","),
        ...(logs || []).map((l) =>
          [l.created_at, l.actor, l.action, JSON.stringify(l.payload || {}), l.payload_hash, l.prev_hash || ""].map(esc).join(",")
        ),
      ];
      return new NextResponse(rows.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="gem-audit-${sessionId}.csv"`,
        },
      });
    }

    return NextResponse.json({ session_id: sessionId, logs: logs || [], chain });
  } catch (error: any) {
    console.error("gem-participation audit error:", error);
    return NextResponse.json({ error: error.message || "Audit export failed" }, { status: 500 });
  }
}
