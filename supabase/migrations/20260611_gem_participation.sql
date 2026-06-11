-- GeM Automatic Bid Participation
-- Sessions, field-level AI suggestions with consent tracking, document
-- approvals with hashes, and an append-only hash-chained audit log.

-- Credential METADATA only. Actual secrets (GeM password, Gmail app password)
-- are encrypted with the OS keychain (Electron safeStorage) and never leave
-- the user's device — this table only records that they exist and where.
CREATE TABLE IF NOT EXISTS gem_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  gem_user_id text,                     -- GeM seller login id (not a secret)
  device_label text,                    -- which machine holds the encrypted secrets
  has_gem_password boolean NOT NULL DEFAULT false,
  gmail_email text,
  has_gmail_password boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id)
);

-- One row per participation attempt
CREATE TABLE IF NOT EXISTS gem_participation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  bid_id uuid NOT NULL REFERENCES gem_bids(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  -- draft → preparing → awaiting_consent → approved → in_session
  --       → awaiting_final_submit → submitted | failed | cancelled
  created_by uuid NOT NULL,
  consent_given_at timestamptz,
  consent_given_by uuid,
  final_submit_confirmed_at timestamptz,
  submission_ref text,                  -- GeM confirmation/reference number
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Every form field the AI proposes, with provenance and the user's verdict
CREATE TABLE IF NOT EXISTS gem_participation_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES gem_participation_sessions(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  input_type text NOT NULL DEFAULT 'text',   -- text | number | textarea | boolean
  ai_suggested_value text,
  ai_source text,                       -- where the value came from (profile field, bid analysis...)
  ai_reasoning text,
  user_value text,                      -- final value after review (null until reviewed)
  status text NOT NULL DEFAULT 'suggested',  -- suggested | approved | edited | rejected
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every document proposed for upload, with its hash
CREATE TABLE IF NOT EXISTS gem_participation_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES gem_participation_sessions(id) ON DELETE CASCADE,
  source_doc_id uuid REFERENCES gem_bid_documents(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  purpose text,                         -- which checklist requirement it satisfies
  sha256 text,
  status text NOT NULL DEFAULT 'proposed',   -- proposed | approved | rejected | uploaded
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only audit trail with per-session hash chain.
-- RLS below grants INSERT and SELECT only — there are deliberately no
-- UPDATE/DELETE policies, so history cannot be altered through the API.
CREATE TABLE IF NOT EXISTS gem_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  session_id uuid REFERENCES gem_participation_sessions(id) ON DELETE CASCADE,
  actor text NOT NULL,                  -- 'ai' | 'user' | 'system'
  actor_user_id uuid,
  action text NOT NULL,
  payload jsonb,
  payload_hash text NOT NULL,           -- sha256(prev_hash + canonical payload)
  prev_hash text,                       -- hash of the previous entry in this session
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE gem_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_participation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_participation_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_participation_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage own credentials meta" ON gem_credentials
  FOR ALL USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members view own sessions" ON gem_participation_sessions
  FOR SELECT USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Members insert own sessions" ON gem_participation_sessions
  FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Members update own sessions" ON gem_participation_sessions
  FOR UPDATE USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Members view own session fields" ON gem_participation_fields
  FOR SELECT USING (session_id IN (
    SELECT id FROM gem_participation_sessions
    WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));
CREATE POLICY "Members insert own session fields" ON gem_participation_fields
  FOR INSERT WITH CHECK (session_id IN (
    SELECT id FROM gem_participation_sessions
    WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));
CREATE POLICY "Members update own session fields" ON gem_participation_fields
  FOR UPDATE USING (session_id IN (
    SELECT id FROM gem_participation_sessions
    WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));

CREATE POLICY "Members view own session docs" ON gem_participation_documents
  FOR SELECT USING (session_id IN (
    SELECT id FROM gem_participation_sessions
    WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));
CREATE POLICY "Members insert own session docs" ON gem_participation_documents
  FOR INSERT WITH CHECK (session_id IN (
    SELECT id FROM gem_participation_sessions
    WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));
CREATE POLICY "Members update own session docs" ON gem_participation_documents
  FOR UPDATE USING (session_id IN (
    SELECT id FROM gem_participation_sessions
    WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));

-- Audit log: INSERT + SELECT only. No UPDATE/DELETE policies exist.
CREATE POLICY "Members view own audit logs" ON gem_audit_logs
  FOR SELECT USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));
CREATE POLICY "Members insert own audit logs" ON gem_audit_logs
  FOR INSERT WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gem_part_sessions_bid ON gem_participation_sessions(bid_id);
CREATE INDEX IF NOT EXISTS idx_gem_part_sessions_business ON gem_participation_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_gem_part_fields_session ON gem_participation_fields(session_id);
CREATE INDEX IF NOT EXISTS idx_gem_part_docs_session ON gem_participation_documents(session_id);
CREATE INDEX IF NOT EXISTS idx_gem_audit_session ON gem_audit_logs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gem_audit_business ON gem_audit_logs(business_id, created_at);
