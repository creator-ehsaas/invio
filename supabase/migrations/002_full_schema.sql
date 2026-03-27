-- Full schema for Invio app
-- Run this after 001_initial_schema.sql

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  gstin TEXT,
  billing_address JSONB DEFAULT '{}',
  shipping_address JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inventory items table
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  hsn_code TEXT,
  unit TEXT DEFAULT 'pcs',
  unit_price DECIMAL(12, 2) DEFAULT 0,
  current_stock INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  gst_rate DECIMAL(5, 2) DEFAULT 18,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  subtotal DECIMAL(12, 2) DEFAULT 0,
  cgst DECIMAL(12, 2) DEFAULT 0,
  sgst DECIMAL(12, 2) DEFAULT 0,
  igst DECIMAL(12, 2) DEFAULT 0,
  total DECIMAL(12, 2) DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
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

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_business_id ON inventory_items(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_business_id ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers
CREATE POLICY "Users can view their business customers"
  ON customers FOR SELECT
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert customers for their business"
  ON customers FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their business customers"
  ON customers FOR UPDATE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their business customers"
  ON customers FOR DELETE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- RLS Policies for inventory_items
CREATE POLICY "Users can view their business inventory"
  ON inventory_items FOR SELECT
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert inventory for their business"
  ON inventory_items FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their business inventory"
  ON inventory_items FOR UPDATE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their business inventory"
  ON inventory_items FOR DELETE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- RLS Policies for invoices
CREATE POLICY "Users can view their business invoices"
  ON invoices FOR SELECT
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert invoices for their business"
  ON invoices FOR INSERT
  WITH CHECK (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their business invoices"
  ON invoices FOR UPDATE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their business invoices"
  ON invoices FOR DELETE
  USING (business_id IN (SELECT business_id FROM users WHERE id = auth.uid()));

-- RLS Policies for invoice_items (via invoice)
CREATE POLICY "Users can view invoice items"
  ON invoice_items FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert invoice items"
  ON invoice_items FOR INSERT
  WITH CHECK (invoice_id IN (
    SELECT id FROM invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update invoice items"
  ON invoice_items FOR UPDATE
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete invoice items"
  ON invoice_items FOR DELETE
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

-- RLS Policies for payments (via invoice)
CREATE POLICY "Users can view payments"
  ON payments FOR SELECT
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert payments"
  ON payments FOR INSERT
  WITH CHECK (invoice_id IN (
    SELECT id FROM invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
