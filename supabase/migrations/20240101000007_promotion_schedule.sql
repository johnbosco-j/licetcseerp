CREATE TABLE IF NOT EXISTS promotion_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year   TEXT NOT NULL,
  promotion_date  TIMESTAMPTZ DEFAULT now(),
  promoted_count  INTEGER DEFAULT 0,
  graduated_count INTEGER DEFAULT 0,
  run_by          UUID REFERENCES profiles(id),
  notes           TEXT
);

CREATE TABLE IF NOT EXISTS student_promotion_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID REFERENCES profiles(id),
  from_section  TEXT,
  to_section    TEXT,
  from_sem      INTEGER,
  to_sem        INTEGER,
  academic_year TEXT,
  promoted_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE promotion_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_promotion_history  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prolog_read"  ON promotion_log             FOR SELECT TO authenticated USING (true);
CREATE POLICY "prolog_write" ON promotion_log             FOR ALL    TO authenticated USING (true);
CREATE POLICY "sph_read"     ON student_promotion_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "sph_write"    ON student_promotion_history FOR ALL    TO authenticated USING (true);
