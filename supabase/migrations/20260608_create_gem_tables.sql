-- GeM Bid Finder tables
-- Run this migration in your Supabase SQL editor

-- Main bids table
CREATE TABLE IF NOT EXISTS gem_bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  gem_bid_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  category text,
  quantity text,
  uom text,
  department text,
  organization text,
  start_date timestamptz,
  end_date timestamptz,
  estimated_value numeric,
  bid_type text,
  status text NOT NULL DEFAULT 'new',
  ai_summary text,
  ai_eligibility jsonb,
  ai_requirements jsonb,
  ai_doc_checklist jsonb,
  raw_html text,
  bid_url text,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, gem_bid_id)
);

-- Tender documents table
CREATE TABLE IF NOT EXISTS gem_bid_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_bid_id uuid NOT NULL REFERENCES gem_bids(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other',
  file_name text NOT NULL,
  file_url text NOT NULL,
  ai_analysis text,
  is_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Scan audit log
CREATE TABLE IF NOT EXISTS gem_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  scan_type text NOT NULL DEFAULT 'manual',
  bids_found integer NOT NULL DEFAULT 0,
  bids_new integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error_message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE gem_bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_bid_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_scan_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for gem_bids
CREATE POLICY "Users can view own business bids" ON gem_bids
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can insert own business bids" ON gem_bids
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can update own business bids" ON gem_bids
  FOR UPDATE USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can delete own business bids" ON gem_bids
  FOR DELETE USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

-- RLS policies for gem_bid_documents
CREATE POLICY "Users can view own bid documents" ON gem_bid_documents
  FOR SELECT USING (
    gem_bid_id IN (SELECT id FROM gem_bids WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  );
CREATE POLICY "Users can insert own bid documents" ON gem_bid_documents
  FOR INSERT WITH CHECK (
    gem_bid_id IN (SELECT id FROM gem_bids WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  );
CREATE POLICY "Users can delete own bid documents" ON gem_bid_documents
  FOR DELETE USING (
    gem_bid_id IN (SELECT id FROM gem_bids WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  );

-- RLS policies for gem_scan_logs
CREATE POLICY "Users can view own scan logs" ON gem_scan_logs
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can insert own scan logs" ON gem_scan_logs
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gem_bids_business ON gem_bids(business_id);
CREATE INDEX IF NOT EXISTS idx_gem_bids_status ON gem_bids(status);
CREATE INDEX IF NOT EXISTS idx_gem_bids_end_date ON gem_bids(end_date);
CREATE INDEX IF NOT EXISTS idx_gem_bid_docs_bid ON gem_bid_documents(gem_bid_id);
CREATE INDEX IF NOT EXISTS idx_gem_scan_logs_business ON gem_scan_logs(business_id);

-- Create storage bucket for gem documents
INSERT INTO storage.buckets (id, name, public) VALUES ('gem-documents', 'gem-documents', false) ON CONFLICT (id) DO NOTHING;
