-- GeM Config Table migration
CREATE TABLE IF NOT EXISTS gem_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE UNIQUE,
  gem_username text,
  gem_password text,
  categories text[] DEFAULT '{}',
  keywords text[] DEFAULT '{}',
  scan_frequency text DEFAULT 'manual',
  notifications_enabled boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE gem_config ENABLE ROW LEVEL SECURITY;

-- RLS policies for gem_config
CREATE POLICY "Users can view own business gem config" ON gem_config
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can insert own business gem config" ON gem_config
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can update own business gem config" ON gem_config
  FOR UPDATE USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
CREATE POLICY "Users can delete own business gem config" ON gem_config
  FOR DELETE USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

-- Trigger for updated_at
CREATE TRIGGER update_gem_config_updated_at
  BEFORE UPDATE ON gem_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
