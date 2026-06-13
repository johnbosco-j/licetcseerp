-- Freeze table: HOD can lock marks/attendance per subject per section
CREATE TABLE IF NOT EXISTS subject_locks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID REFERENCES subjects(id) ON DELETE CASCADE,
  lock_type    TEXT NOT NULL CHECK (lock_type IN ('ATTENDANCE','MARKS','BOTH')),
  locked_by    UUID REFERENCES profiles(id),
  locked_at    TIMESTAMPTZ DEFAULT now(),
  reason       TEXT,
  UNIQUE(subject_id, lock_type)
);

ALTER TABLE subject_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "locks_read"  ON subject_locks FOR SELECT TO authenticated USING (true);
CREATE POLICY "locks_write" ON subject_locks FOR ALL    TO authenticated USING (true);
