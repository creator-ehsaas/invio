import crypto from "crypto";
import { createClient as createServiceClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Append-only audit logging for GeM bid participation.
 *
 * Each entry's payload_hash = sha256(prev_hash + canonical(payload)), where
 * prev_hash is the previous entry's payload_hash within the same session.
 * The table has no UPDATE/DELETE RLS policies, so entries can't be altered
 * through the API; the chain makes out-of-band tampering detectable.
 */

export type AuditActor = "ai" | "user" | "system";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function serviceClient(): SupabaseClient {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function writeAuditLog(opts: {
  businessId: string;
  sessionId: string | null;
  actor: AuditActor;
  actorUserId?: string | null;
  action: string;
  payload?: Record<string, unknown>;
}): Promise<{ id: string; payload_hash: string } | null> {
  const supabase = serviceClient();

  let prevHash: string | null = null;
  if (opts.sessionId) {
    const { data: last } = await supabase
      .from("gem_audit_logs")
      .select("payload_hash")
      .eq("session_id", opts.sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    prevHash = last?.payload_hash || null;
  }

  const payload = opts.payload || {};
  const payloadHash = crypto
    .createHash("sha256")
    .update((prevHash || "") + canonicalize({ action: opts.action, ...payload }))
    .digest("hex");

  const { data, error } = await supabase
    .from("gem_audit_logs")
    .insert({
      business_id: opts.businessId,
      session_id: opts.sessionId,
      actor: opts.actor,
      actor_user_id: opts.actorUserId || null,
      action: opts.action,
      payload,
      payload_hash: payloadHash,
      prev_hash: prevHash,
    })
    .select("id, payload_hash")
    .single();

  if (error) {
    // Audit failures must be loud — callers treat this as a hard error
    console.error("AUDIT LOG WRITE FAILED:", error.message, opts.action);
    return null;
  }
  return data;
}

/** Recompute the chain for a session and report whether it's intact. */
export async function verifyAuditChain(sessionId: string): Promise<{ valid: boolean; entries: number; brokenAt?: string }> {
  const supabase = serviceClient();
  const { data: logs } = await supabase
    .from("gem_audit_logs")
    .select("id, action, payload, payload_hash, prev_hash")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  let prevHash: string | null = null;
  for (const log of logs || []) {
    if ((log.prev_hash || null) !== prevHash) return { valid: false, entries: logs!.length, brokenAt: log.id };
    const expected = crypto
      .createHash("sha256")
      .update((prevHash || "") + canonicalize({ action: log.action, ...(log.payload || {}) }))
      .digest("hex");
    if (expected !== log.payload_hash) return { valid: false, entries: logs!.length, brokenAt: log.id };
    prevHash = log.payload_hash;
  }
  return { valid: true, entries: logs?.length || 0 };
}
