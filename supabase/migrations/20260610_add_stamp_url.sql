-- Add stamp_url to businesses table for company stamp image
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS stamp_url TEXT;

-- Add index for faster lookups when generating documents
COMMENT ON COLUMN businesses.stamp_url IS 'URL to company stamp image for document generation';
