-- ============================================================
-- Migration 009: Invoice Discounts
-- Adds line-item discount and overall invoice discount support
-- ============================================================

-- Add discount to invoice items (per-line discount)
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add overall discount to invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add discount to estimate items (for consistency)
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add overall discount to estimates
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add discount to purchase invoice items too
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoice_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add overall discount to purchase invoices
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ============================================================
-- Payment Receipts Table
-- Stores generated payment receipt details
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL,
  amount_in_words TEXT,
  customer_name TEXT,
  invoice_number TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_receipts_payment_id ON payment_receipts(payment_id);

ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their payment receipts"
  ON payment_receipts FOR ALL TO authenticated
  USING (payment_id IN (
    SELECT p.id FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE i.business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  ))
  WITH CHECK (payment_id IN (
    SELECT p.id FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE i.business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  ));

-- Add receipt number sequence to businesses
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS next_receipt_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS receipt_prefix TEXT NOT NULL DEFAULT 'RCP-';
