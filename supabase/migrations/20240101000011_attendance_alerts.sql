CREATE TABLE IF NOT EXISTS attendance_alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID REFERENCES profiles(id),
  section      TEXT NOT NULL,
  date         DATE NOT NULL,
  missed_parts INTEGER[] NOT NULL,
  alert_type   TEXT NOT NULL DEFAULT 'PARTIAL_ABSENT',
  email_sent   BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  met_hod      BOOLEAN DEFAULT false,
  met_hod_at   TIMESTAMPTZ,
  cleared_by   UUID REFERENCES profiles(id),
  cleared_at   TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE attendance_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_read"  ON attendance_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_write" ON attendance_alerts FOR ALL    TO authenticated USING (true);
