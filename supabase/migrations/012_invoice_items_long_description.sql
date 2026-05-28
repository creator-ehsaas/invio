-- Add long_description to invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS long_description TEXT;
