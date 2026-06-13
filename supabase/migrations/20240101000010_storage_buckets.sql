-- Question papers bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'question-papers',
  'question-papers',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
) ON CONFLICT (id) DO NOTHING;

-- NAAC/NBA documents bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'naac-documents',
  'naac-documents',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png']
) ON CONFLICT (id) DO NOTHING;

-- General documents bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dept-documents',
  'dept-documents',
  false,
  52428800,
  ARRAY['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

-- Storage policies — authenticated users can upload and read
CREATE POLICY "auth_upload_qp" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'question-papers');
CREATE POLICY "auth_read_qp"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'question-papers');
CREATE POLICY "auth_delete_qp" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'question-papers');

CREATE POLICY "auth_upload_naac" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'naac-documents');
CREATE POLICY "auth_read_naac"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'naac-documents');
CREATE POLICY "auth_delete_naac" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'naac-documents');

CREATE POLICY "auth_upload_docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dept-documents');
CREATE POLICY "auth_read_docs"   ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dept-documents');
CREATE POLICY "auth_delete_docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dept-documents');
