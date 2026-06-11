import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { writeAuditLog, serviceClient, AuditActor } from "@/lib/gem-audit";
import { getAuthContext, getOwnedSession } from "@/lib/gem-participation";

/**
 * Records automation progress events into the audit chain and drives the
 * session status machine. Screenshots are stored as evidence with hashes.
 *
 * POST /api/gem-participation/events
 * Body: { session_id, type, payload?, screenshot_base64? }
 */

// type → [actor, optional session status transition]
const EVENT_TYPES: Record<string, { actor: AuditActor; status?: string }> = {
  session_opened: { actor: "system", status: "in_session" },
  login_started: { actor: "system" },
  login_filled: { actor: "system" },
  otp_listening: { actor: "system" },
  otp_filled: { actor: "system" },
  otp_manual_entered: { actor: "user" },
  navigated: { actor: "system" },
  form_filled: { actor: "system" },
  doc_attached: { actor: "system" },
  screenshot_captured: { actor: "system" },
  manual_takeover: { actor: "user" },
  ready_for_submit: { actor: "user", status: "awaiting_final_submit" },
  final_submit_confirmed: { actor: "user" },
  submit_clicked: { actor: "system" },
  submitted: { actor: "system", status: "submitted" },
  failed: { actor: "system", status: "failed" },
  cancelled: { actor: "user", status: "cancelled" },
  session_closed: { actor: "system" },
};

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { session_id, type, payload = {}, screenshot_base64 } = await request.json();
    if (!session_id || !type) {
      return NextResponse.json({ error: "session_id and type are required" }, { status: 400 });
    }
    const eventDef = EVENT_TYPES[type];
    if (!eventDef) return NextResponse.json({ error: `Unknown event type: ${type}` }, { status: 400 });

    const session = await getOwnedSession(auth.businessId, session_id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (["submitted", "failed", "cancelled"].includes(session.status) && type !== "session_closed") {
      return NextResponse.json({ error: "Session is already closed" }, { status: 422 });
    }

    const supabase = serviceClient();
    const auditPayload: Record<string, unknown> = { ...payload };

    // Persist screenshot evidence to private storage, log its hash
    if (screenshot_base64 && typeof screenshot_base64 === "string" && screenshot_base64.length < 8_000_000) {
      const buffer = Buffer.from(screenshot_base64, "base64");
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      const path = `sessions/${auth.businessId}/${session_id}/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage
        .from("gem-documents")
        .upload(path, buffer, { contentType: "image/png" });
      if (!upErr) {
        auditPayload.screenshot_path = path;
        auditPayload.screenshot_sha256 = hash;
      } else {
        auditPayload.screenshot_error = upErr.message;
      }
    }

    // Status machine transitions
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (eventDef.status) {
      // Guard: only an approved session may enter the live portal phase
      if (eventDef.status === "in_session" && session.status !== "approved" && session.status !== "in_session") {
        return NextResponse.json({ error: "Session is not approved — consent is required first" }, { status: 422 });
      }
      updates.status = eventDef.status;
    }
    if (type === "final_submit_confirmed") updates.final_submit_confirmed_at = new Date().toISOString();
    if (type === "submitted") {
      // Final submit must have been explicitly confirmed by the user
      if (!session.final_submit_confirmed_at && !updates.final_submit_confirmed_at) {
        return NextResponse.json({ error: "Final submission was never confirmed by the user" }, { status: 422 });
      }
      if (payload.reference) updates.submission_ref = String(payload.reference).substring(0, 100);
      // Mark uploaded documents
      await supabase
        .from("gem_participation_documents")
        .update({ status: "uploaded" })
        .eq("session_id", session_id)
        .eq("status", "approved");
      // Reflect on the bid itself
      await supabase
        .from("gem_bids")
        .update({ status: "applied", updated_at: new Date().toISOString() })
        .eq("id", session.bid_id);
    }
    if (type === "failed" && payload.error) {
      updates.error_message = String(payload.error).substring(0, 500);
    }

    await supabase.from("gem_participation_sessions").update(updates).eq("id", session_id);

    const log = await writeAuditLog({
      businessId: auth.businessId,
      sessionId: session_id,
      actor: eventDef.actor,
      actorUserId: eventDef.actor === "user" ? auth.userId : null,
      action: type,
      payload: auditPayload,
    });
    if (!log) return NextResponse.json({ error: "Audit log write failed — action recorded nowhere, aborting" }, { status: 500 });

    return NextResponse.json({ ok: true, status: updates.status || session.status });
  } catch (error: any) {
    console.error("gem-participation events error:", error);
    return NextResponse.json({ error: error.message || "Event logging failed" }, { status: 500 });
  }
}
