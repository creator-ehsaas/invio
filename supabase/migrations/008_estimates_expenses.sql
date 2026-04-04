-- ============================================================
-- Migration 008: Estimates/Quotations + Expense Tracking
-- ============================================================

-- Reusable updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ESTIMATES / QUOTATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  estimate_number TEXT NOT NULL,
  estimate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  -- When converted to invoice, store the invoice ID
  converted_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  hsn_code TEXT,
  quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'pcs',
  rate NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 18,
  cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
  igst NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_estimates_business_id ON estimates(business_id);
CREATE INDEX IF NOT EXISTS idx_estimates_customer_id ON estimates(customer_id);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id ON estimate_items(estimate_id);

-- RLS
ALTER TABLE estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their business estimates"
  ON estimates FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users manage their business estimate items"
  ON estimate_items FOR ALL TO authenticated
  USING (estimate_id IN (
    SELECT id FROM estimates WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ))
  WITH CHECK (estimate_id IN (
    SELECT id FROM estimates WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

-- Trigger
CREATE TRIGGER set_estimates_updated_at
  BEFORE UPDATE ON estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- EXPENSE CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_business_id ON expense_categories(business_id);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their expense categories"
  ON expense_categories FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- ============================================================
-- EXPENSES
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  category_name TEXT,           -- Denormalized for speed / category deletion safety
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,   -- GST paid on this expense (ITC if applicable)
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','bank','upi','card','cheque','other')),
  reference_number TEXT,
  vendor_name TEXT,
  attachment_url TEXT,
  notes TEXT,
  is_itc_eligible BOOLEAN NOT NULL DEFAULT FALSE,   -- Can claim ITC on this expense?
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_business_id ON expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their business expenses"
  ON expenses FOR ALL TO authenticated
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()))
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE TRIGGER set_expenses_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- SEED DEFAULT EXPENSE CATEGORIES
-- (Run per-business at onboarding; here we store global seeds)
-- These are inserted via app logic on business creation,
-- but the function below can seed for existing businesses.
-- ============================================================

-- Function to seed default categories for a business
CREATE OR REPLACE FUNCTION seed_default_expense_categories(p_business_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO expense_categories (business_id, name, description, is_default) VALUES
    (p_business_id, 'Rent',           'Office / shop rent',              TRUE),
    (p_business_id, 'Salaries',       'Employee salaries and wages',     TRUE),
    (p_business_id, 'Utilities',      'Electricity, water, internet',    TRUE),
    (p_business_id, 'Transport',      'Freight, delivery, travel',       TRUE),
    (p_business_id, 'Marketing',      'Ads, promotions, printing',       TRUE),
    (p_business_id, 'Repairs',        'Equipment and premises repairs',  TRUE),
    (p_business_id, 'Office Supplies','Stationery and consumables',      TRUE),
    (p_business_id, 'Petty Cash',     'Small miscellaneous expenses',    TRUE),
    (p_business_id, 'Bank Charges',   'Bank fees, interest, EMI',        TRUE),
    (p_business_id, 'Other',          'Miscellaneous',                   TRUE)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Add estimate_number sequence helper to businesses
-- ============================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS next_estimate_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS estimate_prefix TEXT NOT NULL DEFAULT 'EST-';
