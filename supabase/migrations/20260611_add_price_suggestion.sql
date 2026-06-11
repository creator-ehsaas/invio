-- Persist the AI price suggestion so it is stable across page loads and only
-- changes when the user explicitly regenerates it.
ALTER TABLE gem_bids ADD COLUMN IF NOT EXISTS ai_price_suggestion JSONB;
