-- Create storage bucket for business assets (logos, signatures, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-assets',
  'business-assets',
  true,
  2097152, -- 2MB limit
  ARRAY['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their business folder
CREATE POLICY "Users can upload business assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-assets'
);

-- Allow public read access to business assets
CREATE POLICY "Public read access for business assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'business-assets');

-- Allow users to update/delete their own uploads
CREATE POLICY "Users can manage own business assets"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'business-assets')
WITH CHECK (bucket_id = 'business-assets');
