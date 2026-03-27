-- Subscriptions table for Dodo Payments
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY, -- Dodo subscription_id
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL, -- 'pro_monthly' or 'pro_yearly'
  product_id TEXT, -- Dodo product_id
  status TEXT NOT NULL DEFAULT 'active', -- active, on_hold, cancelled, expired
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Subscription payments table (separate from invoice payments)
CREATE TABLE IF NOT EXISTS subscription_payments (
  id TEXT PRIMARY KEY, -- Dodo payment_id
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL, -- Amount in smallest currency unit (paise)
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL, -- succeeded, failed, pending
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for subscription payment lookups
CREATE INDEX IF NOT EXISTS idx_subscription_payments_user ON subscription_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_sub ON subscription_payments(subscription_id);

-- Add subscription fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invoices_this_month INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invoices_reset_date TIMESTAMPTZ DEFAULT NOW();

-- RLS Policies for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for subscription_payments
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription payments" ON subscription_payments
  FOR SELECT USING (auth.uid() = user_id);

-- Function to increment invoice count
CREATE OR REPLACE FUNCTION increment_invoice_count(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET invoices_this_month = invoices_this_month + 1
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
