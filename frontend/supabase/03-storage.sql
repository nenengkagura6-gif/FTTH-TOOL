-- ==================================================
-- SUPABASE STORAGE SETUP
-- Buckets & RLS policies for file management
-- ==================================================

-- 1. Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('uploads', 'uploads', false, 52428800, ARRAY[
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/xml',
    'text/xml',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream'
  ]),
  ('outputs', 'outputs', false, 104857600, ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/zip',
    'application/pdf',
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/octet-stream'
  ])
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS Policies

-- UPLOADS bucket: users can upload/read/delete their own files
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own uploads"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own uploads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- OUTPUTS bucket: users can read their own results
CREATE POLICY "Users can read own outputs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'outputs' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Service role can do everything (for backend workers)
CREATE POLICY "Service role full access uploads"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'uploads')
  WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Service role full access outputs"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'outputs')
  WITH CHECK (bucket_id = 'outputs');

-- 3. Add admin role to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));

-- 4. Set admin 
UPDATE profiles SET role = 'admin' WHERE email = 'nenengkagura6@gmail.com';
