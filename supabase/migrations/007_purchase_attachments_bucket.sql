-- Create storage bucket for purchase invoice attachments (images/PDFs)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'purchase-attachments',
  'purchase-attachments',
  true,
  10485760, -- 10MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload purchase attachments
CREATE POLICY "Users can upload purchase attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'purchase-attachments');

-- Allow public read access to purchase attachments
CREATE POLICY "Public read access for purchase attachments"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'purchase-attachments');

-- Allow users to manage their own purchase attachments
CREATE POLICY "Users can manage purchase attachments"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'purchase-attachments')
WITH CHECK (bucket_id = 'purchase-attachments');
