-- AI Feedback table for learning from user corrections
-- This stores the original voice transcript, AI's parsed result, and user's corrections
-- Used for few-shot learning to improve AI accuracy over time

CREATE TABLE IF NOT EXISTS ai_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  original_transcript TEXT NOT NULL,
  ai_parsed JSONB NOT NULL,
  user_corrected JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fetching recent feedback by business
CREATE INDEX IF NOT EXISTS idx_ai_feedback_business ON ai_feedback(business_id, created_at DESC);

-- RLS policies
ALTER TABLE ai_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business feedback" ON ai_feedback
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert feedback for own business" ON ai_feedback
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM users WHERE id = auth.uid())
  );
