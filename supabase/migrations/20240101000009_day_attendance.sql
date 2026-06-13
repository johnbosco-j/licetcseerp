CREATE TABLE IF NOT EXISTS day_attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,
  date        DATE NOT NULL,
  part        INTEGER NOT NULL CHECK (part IN (1,2,3)),
  status      TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT')),
  marked_by   UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, date, part)
);

ALTER TABLE day_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "day_att_read"  ON day_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "day_att_write" ON day_attendance FOR ALL    TO authenticated USING (true);
