-- Drop existing policies
DROP POLICY IF EXISTS "Users can view purchase payments" ON purchase_payments;
DROP POLICY IF EXISTS "Users can insert purchase payments" ON purchase_payments;

-- Create comprehensive SELECT, INSERT, UPDATE, and DELETE policies
CREATE POLICY "Users can select purchase payments"
  ON purchase_payments FOR SELECT TO authenticated
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can insert purchase payments"
  ON purchase_payments FOR INSERT TO authenticated
  WITH CHECK (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update purchase payments"
  ON purchase_payments FOR UPDATE TO authenticated
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ))
  WITH CHECK (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete purchase payments"
  ON purchase_payments FOR DELETE TO authenticated
  USING (purchase_invoice_id IN (
    SELECT id FROM purchase_invoices WHERE business_id IN (
      SELECT business_id FROM users WHERE id = auth.uid()
    )
  ));
