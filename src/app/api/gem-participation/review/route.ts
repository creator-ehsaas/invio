import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog, serviceClient } from "@/lib/gem-audit";
import { getAuthContext, getOwnedSession } from "@/lib/gem-participation";

/**
 * Field-by-field and document-by-document review actions.
 * Every verdict is audit-logged with what the AI suggested vs. what the
 * user decided.
 *
 * PATCH /api/gem-participation/review
 * Body: { session_id, field_id?, document_id?, action: "approve"|"edit"|"reject", value? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { session_id, field_id, document_id, action, value } = await request.json();
    if (!session_id || !action) {
      return NextResponse.json({ error: "session_id and action are required" }, { status: 400 });
    }
    if (!["approve", "edit", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
    if (!field_id && !document_id) {
      return NextResponse.json({ error: "field_id or document_id is required" }, { status: 400 });
    }

    const session = await getOwnedSession(auth.businessId, session_id);
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    if (!["awaiting_consent", "draft"].includes(session.status)) {
      return NextResponse.json({ error: "Session is no longer in review" }, { status: 422 });
    }

    const supabase = serviceClient();
    const now = new Date().toISOString();

    if (field_id) {
      const { data: field } = await supabase
        .from("gem_participation_fields")
        .select("*")
        .eq("id", field_id)
        .eq("session_id", session_id)
        .maybeSingle();
      if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 });

      if (action === "edit" && (value == null || String(value).trim() === "")) {
        return NextResponse.json({ error: "An edited field needs a value" }, { status: 400 });
      }

      const newStatus = action === "approve" ? "approved" : action === "edit" ? "edited" : "rejected";
      const userValue =
        action === "approve" ? field.ai_suggested_value :
        action === "edit" ? String(value).substring(0, 2000) :
        null;

      const { data: updated, error } = await supabase
        .from("gem_participation_fields")
        .update({ status: newStatus, user_value: userValue, reviewed_at: now })
        .eq("id", field_id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await writeAuditLog({
        businessId: auth.businessId,
        sessionId: session_id,
        actor: "user",
        actorUserId: auth.userId,
        action: `field_${newStatus}`,
        payload: {
          field_key: field.field_key,
          field_label: field.field_label,
          ai_suggested_value: field.ai_suggested_value,
          final_value: userValue,
        },
      });

      return NextResponse.json({ field: updated });
    }

    // Document review
    const { data: doc } = await supabase
      .from("gem_participation_documents")
      .select("*")
      .eq("id", document_id)
      .eq("session_id", session_id)
      .maybeSingle();
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (action === "edit") {
      return NextResponse.json({ error: "Documents can only be approved or rejected" }, { status: 400 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";
    const { data: updated, error } = await supabase
      .from("gem_participation_documents")
      .update({ status: newStatus, reviewed_at: now })
      .eq("id", document_id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog({
      businessId: auth.businessId,
      sessionId: session_id,
      actor: "user",
      actorUserId: auth.userId,
      action: `document_${newStatus}`,
      payload: { file_name: doc.file_name, sha256: doc.sha256, purpose: doc.purpose },
    });

    return NextResponse.json({ document: updated });
  } catch (error: any) {
    console.error("gem-participation review error:", error);
    return NextResponse.json({ error: error.message || "Review failed" }, { status: 500 });
  }
}
