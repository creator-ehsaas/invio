-- Ensure update_updated_at function exists (may already exist from 002_full_schema.sql)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Suppliers/Vendors table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  gstin TEXT,
  pan TEXT,
  address JSONB DEFAULT '{}',
  bank_details JSONB DEFAULT '{}',
  payment_terms INTEGER DEFAULT 30, -- days
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase invoices (bills from suppliers)
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  bill_number TEXT NOT NULL, -- supplier's invoice/bill number
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  received_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'cancelled')),
  subtotal DECIMAL(12, 2) DEFAULT 0,
  cgst DECIMAL(12, 2) DEFAULT 0,
  sgst DECIMAL(12, 2) DEFAULT 0,
  igst DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) DEFAULT 0,
  amount_paid DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  attachment_url TEXT, -- URL to scanned bill
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase invoice items
CREATE TABLE IF NOT EXISTS purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  hsn_code TEXT,
  quantity DECIMAL(10, 3) DEFAULT 1,
  unit TEXT DEFAULT 'pcs',
  rate DECIMAL(12, 2) DEFAULT 0,
  gst_rate DECIMAL(5, 2) DEFAULT 18,
  cgst DECIMAL(12, 2) DEFAULT 0,
  sgst DECIMAL(12, 2) DEFAULT 0,
  igst DECIMAL(12, 2) DEFAULT 0,
  amount DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchase payments
CREATE TABLE IF NOT EXISTS purchase_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'bank_transfer',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- GSTR-3B monthly summaries (cached for performance)
CREATE TABLE IF NOT EXISTS gstr3b_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  tax_period TEXT NOT NULL, -- Format: YYYY-MM
  -- Outward supplies (sales)
  outward_taxable_supplies DECIMAL(14, 2) DEFAULT 0,
  outward_zero_rated DECIMAL(14, 2) DEFAULT 0,
  outward_nil_rated DECIMAL(14, 2) DEFAULT 0,
  outward_exempt DECIMAL(14, 2) DEFAULT 0,
  outward_non_gst DECIMAL(14, 2) DEFAULT 0,
  -- Output tax
  output_igst DECIMAL(14, 2) DEFAULT 0,
  output_cgst DECIMAL(14, 2) DEFAULT 0,
  output_sgst DECIMAL(14, 2) DEFAULT 0,
  output_cess DECIMAL(14, 2) DEFAULT 0,
  -- Inward supplies (purchases)
  inward_taxable_supplies DECIMAL(14, 2) DEFAULT 0,
  inward_zero_rated DECIMAL(14, 2) DEFAULT 0,
  inward_exempt DECIMAL(14, 2) DEFAULT 0,
  -- Input tax credit
  itc_igst DECIMAL(14, 2) DEFAULT 0,
  itc_cgst DECIMAL(14, 2) DEFAULT 0,
  itc_sgst DECIMAL(14, 2) DEFAULT 0,
  itc_cess DECIMAL(14, 2) DEFAULT 0,
  -- Net tax payable
  net_igst_payable DECIMAL(14, 2) DEFAULT 0,
  net_cgst_payable DECIMAL(14, 2) DEFAULT 0,
  net_sgst_payable DECIMAL(14, 2) DEFAULT 0,
  net_cess_payable DECIMAL(14, 2) DEFAULT 0,
  total_tax_payable DECIMAL(14, 2) DEFAULT 0,
  -- Filing status
  is_filed BOOLEAN DEFAULT false,
  filed_at TIMESTAMPTZ,
  arn_number TEXT, -- Acknowledgment Reference Number
  -- Metadata
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, tax_period)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_suppliers_business_id ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_business_id ON purchase_invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_id ON purchase_invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status ON purchase_invoices(status);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_bill_date ON purchase_invoices(bill_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_purchase_invoice_id ON purchase_invoice_items(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_purchase_payments_purchase_invoice_id ON purchase_payments(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_gstr3b_summaries_business_period ON gstr3b_summaries(business_id, tax_period);

-- Enable RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gstr3b_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for suppliers
CREATE POLICY "Users can view their business suppliers"
  ON suppliers FOR SELECT
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert suppliers for their business"
  ON suppliers FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their business suppliers"
  ON suppliers FOR UPDATE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their business suppliers"
  ON suppliers FOR DELETE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- RLS Policies for purchase_invoices
CREATE POLICY "Users can view their business purchase invoices"
  ON purchase_invoices FOR SELECT
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert purchase invoices for their business"
  ON purchase_invoices FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their business purchase invoices"
  ON purchase_invoices FOR UPDATE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their business purchase invoices"
  ON purchase_invoices FOR DELETE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- RLS Policies for purchase_invoice_items
CREATE POLICY "Users can view purchase invoice items"
  ON purchase_invoice_items FOR SELECT
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert purchase invoice items"
  ON purchase_invoice_items FOR INSERT
  WITH CHECK (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update purchase invoice items"
  ON purchase_invoice_items FOR UPDATE
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete purchase invoice items"
  ON purchase_invoice_items FOR DELETE
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

-- RLS Policies for purchase_payments
CREATE POLICY "Users can view purchase payments"
  ON purchase_payments FOR SELECT
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert purchase payments"
  ON purchase_payments FOR INSERT
  WITH CHECK (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

-- RLS Policies for gstr3b_summaries
CREATE POLICY "Users can view their business GSTR3B summaries"
  ON gstr3b_summaries FOR SELECT
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert GSTR3B summaries for their business"
  ON gstr3b_summaries FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their business GSTR3B summaries"
  ON gstr3b_summaries FOR UPDATE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- Triggers for updated_at
CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_purchase_invoices_updated_at
  BEFORE UPDATE ON purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_gstr3b_summaries_updated_at
  BEFORE UPDATE ON gstr3b_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
