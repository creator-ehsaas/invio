ALTER TABLE gem_bids
  ADD COLUMN IF NOT EXISTS ai_risk_assessment TEXT,
  ADD COLUMN IF NOT EXISTS ai_evaluation_method TEXT,
  ADD COLUMN IF NOT EXISTS ai_emd_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_delivery_date TEXT;
