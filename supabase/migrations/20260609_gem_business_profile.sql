-- 1. Business capability profile table
CREATE TABLE IF NOT EXISTS gem_business_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID UNIQUE NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- MSME
  msme_category TEXT CHECK (msme_category IN ('micro', 'small', 'medium', 'none')),
  udyam_number TEXT,

  -- Financial capacity (values in INR lakhs)
  turnover_fy1 NUMERIC,
  turnover_fy2 NUMERIC,
  turnover_fy3 NUMERIC,
  turnover_fy_labels TEXT[],

  years_in_business INTEGER,
  gem_seller_registered BOOLEAN DEFAULT FALSE,
  gem_seller_id TEXT,

  certifications TEXT[],
  supply_states TEXT[],

  -- AI-generated from invoice analysis
  ai_capability_summary TEXT,
  ai_recommended_categories JSONB,
  ai_typical_bid_min NUMERIC,
  ai_typical_bid_max NUMERIC,
  ai_eligibility_gaps TEXT[],
  ai_product_categories TEXT[],

  setup_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. New columns on gem_bids
ALTER TABLE gem_bids
  ADD COLUMN IF NOT EXISTS ai_match_score   INTEGER,
  ADD COLUMN IF NOT EXISTS ai_match_reason  TEXT,
  ADD COLUMN IF NOT EXISTS raw_full_text    TEXT;

-- 3. Extend status check to include 'shortlisted'
ALTER TABLE gem_bids
  DROP CONSTRAINT IF EXISTS gem_bids_status_check;

ALTER TABLE gem_bids
  ADD CONSTRAINT gem_bids_status_check
  CHECK (status IN (
    'new', 'shortlisted', 'analyzing', 'analyzed',
    'interested', 'applied', 'won', 'lost', 'expired'
  ));

-- 4. RLS
ALTER TABLE gem_business_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gem_business_profile_owner"
  ON gem_business_profile
  FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  );
