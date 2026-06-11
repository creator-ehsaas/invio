import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog, serviceClient } from "@/lib/gem-audit";
import { getAuthContext, getOwnedSession } from "@/lib/gem-participation";

/**
 * Explicit consent gate. Requires every field and document to have been
 * reviewed and the literal confirmation text typed by the user. Records a
 * full snapshot of what was approved into the audit chain — this is the
 * exact dataset the automation is later allowed to fill.
 *
 * POST /api/gem-participation/consent  Body: { session_id, confirm_text }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { session_id, confirm_text } = await request.json();
    if (!session_id) return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    if (confirm_text !== "APPROVE") {
      return NextResponse.json({ error: 'Type "APPROVE" to confirm consent' }, { status: 400 });
    }

    const session = await getOwnedSession(auth.businessId, session_id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (session.status !== "awaiting_consent") {
      return NextResponse.json({ error: `Session is in status "${session.status}" — nothing to consent to` }, { status: 422 });
    }

    const supabase = serviceClient();
    const [{ data: fields }, { data: docs }] = await Promise.all([
      supabase.from("gem_participation_fields").select("*").eq("session_id", session_id),
      supabase.from("gem_participation_documents").select("*").eq("session_id", session_id),
    ]);

    const unreviewedFields = (fields || []).filter((f) => f.status === "suggested");
    if (unreviewedFields.length > 0) {
      return NextResponse.json(
        { error: `${unreviewedFields.length} field(s) still need review`, unreviewed: unreviewedFields.map((f) => f.field_label) },
        { status: 422 }
      );
    }
    const unreviewedDocs = (docs || []).filter((d) => d.status === "proposed");
    if (unreviewedDocs.length > 0) {
      return NextResponse.json(
        { error: `${unreviewedDocs.length} document(s) still need review`, unreviewed: unreviewedDocs.map((d) => d.file_name) },
        { status: 422 }
      );
    }
    const approvedFields = (fields || []).filter((f) => f.status === "approved" || f.status === "edited");
    if (approvedFields.length === 0) {
      return NextResponse.json({ error: "At least one field must be approved" }, { status: 422 });
    }

    const now = new Date().toISOString();
    await supabase
      .from("gem_participation_sessions")
      .update({
        status: "approved",
        consent_given_at: now,
        consent_given_by: auth.userId,
        updated_at: now,
      })
      .eq("id", session_id);

    // Snapshot exactly what was consented to — this enters the hash chain
    await writeAuditLog({
      businessId: auth.businessId,
      sessionId: session_id,
      actor: "user",
      actorUserId: auth.userId,
      action: "consent_granted",
      payload: {
        confirm_text,
        approved_fields: approvedFields.map((f) => ({
          field_key: f.field_key,
          field_label: f.field_label,
          value: f.user_value,
          was_edited: f.status === "edited",
        })),
        rejected_fields: (fields || []).filter((f) => f.status === "rejected").map((f) => f.field_key),
        approved_documents: (docs || []).filter((d) => d.status === "approved").map((d) => ({ file_name: d.file_name, sha256: d.sha256 })),
        rejected_documents: (docs || []).filter((d) => d.status === "rejected").map((d) => d.file_name),
      },
    });

    return NextResponse.json({ ok: true, approved_fields: approvedFields.length });
  } catch (error: any) {
    console.error("gem-participation consent error:", error);
    return NextResponse.json({ error: error.message || "Consent failed" }, { status: 500 });
  }
}
