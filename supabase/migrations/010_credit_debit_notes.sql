-- ============================================================
-- Migration 010: Credit Notes & Debit Notes
-- For handling sales returns, price adjustments, and corrections
-- ============================================================

-- Credit Notes (reduce amount owed by customer - for returns, discounts)
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  credit_note_number TEXT NOT NULL,
  credit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL, -- 'return', 'discount', 'price_adjustment', 'other'
  customer_name TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'issued', 'adjusted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'nos',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  original_invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE SET NULL
);

-- Debit Notes (increase amount owed by customer - for undercharges, additions)
CREATE TABLE IF NOT EXISTS debit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  debit_note_number TEXT NOT NULL,
  debit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL, -- 'undercharge', 'additional_service', 'price_increase', 'other'
  customer_name TEXT NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'issued', 'adjusted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS debit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id UUID NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'nos',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_notes_business_id ON credit_notes(business_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON credit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_id ON credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_items_credit_note_id ON credit_note_items(credit_note_id);

CREATE INDEX IF NOT EXISTS idx_debit_notes_business_id ON debit_notes(business_id);
CREATE INDEX IF NOT EXISTS idx_debit_notes_invoice_id ON debit_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_debit_notes_customer_id ON debit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_debit_note_items_debit_note_id ON debit_note_items(debit_note_id);

-- Enable RLS
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE debit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE debit_note_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage their credit notes"
  ON credit_notes FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users manage their credit note items"
  ON credit_note_items FOR ALL TO authenticated
  USING (credit_note_id IN (SELECT id FROM credit_notes WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())))
  WITH CHECK (credit_note_id IN (SELECT id FROM credit_notes WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));

CREATE POLICY "Users manage their debit notes"
  ON debit_notes FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users manage their debit note items"
  ON debit_note_items FOR ALL TO authenticated
  USING (debit_note_id IN (SELECT id FROM debit_notes WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())))
  WITH CHECK (debit_note_id IN (SELECT id FROM debit_notes WHERE business_id IN (SELECT business_id FROM users WHERE id = auth.uid())));

-- Add sequence columns to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS next_credit_note_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS credit_note_prefix TEXT NOT NULL DEFAULT 'CN-';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS next_debit_note_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS debit_note_prefix TEXT NOT NULL DEFAULT 'DN-';
