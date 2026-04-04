-- ============================================================
-- Migration 009a: Fix Payment Receipts Table Structure
-- Updates table to link directly to invoices instead of payments
-- ============================================================

-- Drop the old table if it exists with wrong structure
DROP TABLE IF EXISTS payment_receipts CASCADE;

-- Create the corrected payment_receipts table
CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode TEXT NOT NULL DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_invoice_id ON payment_receipts(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_business_id ON payment_receipts(business_id);

ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their payment receipts" ON payment_receipts;
CREATE POLICY "Users manage their payment receipts"
  ON payment_receipts FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));
