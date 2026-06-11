-- Categorize tender documents discovered during bid fetch
-- (specification / boq / other) so the UI can highlight spec docs
ALTER TABLE gem_bid_documents ADD COLUMN IF NOT EXISTS category TEXT;
