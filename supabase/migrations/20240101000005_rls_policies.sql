-- Enable RLS on all tables
ALTER TABLE profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE placements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_scores ENABLE ROW LEVEL SECURITY;

-- Departments: anyone authenticated can read
CREATE POLICY "departments_read" ON departments
  FOR SELECT TO authenticated USING (true);

-- Subjects: anyone authenticated can read
CREATE POLICY "subjects_read" ON subjects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "subjects_write" ON subjects
  FOR ALL TO authenticated USING (true);

-- Profiles: authenticated users can read all profiles
CREATE POLICY "profiles_read" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_write" ON profiles
  FOR ALL TO authenticated USING (true);

-- Attendance: authenticated users can read/write
CREATE POLICY "attendance_read" ON attendance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "attendance_write" ON attendance
  FOR ALL TO authenticated USING (true);

-- Marks: authenticated users can read/write
CREATE POLICY "marks_read" ON marks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "marks_write" ON marks
  FOR ALL TO authenticated USING (true);

-- Announcements: authenticated can read, staff can write
CREATE POLICY "announcements_read" ON announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "announcements_write" ON announcements
  FOR ALL TO authenticated USING (true);

-- Leaves: authenticated can read/write
CREATE POLICY "leaves_read" ON leaves
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "leaves_write" ON leaves
  FOR ALL TO authenticated USING (true);

-- Grievances: authenticated can read/write
CREATE POLICY "grievances_read" ON grievances
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "grievances_write" ON grievances
  FOR ALL TO authenticated USING (true);

-- Inventory: authenticated can read/write
CREATE POLICY "inventory_read" ON inventory
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory_write" ON inventory
  FOR ALL TO authenticated USING (true);

-- Placements: authenticated can read/write
CREATE POLICY "placements_read" ON placements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "placements_write" ON placements
  FOR ALL TO authenticated USING (true);

-- Finance: authenticated can read/write
CREATE POLICY "finance_read" ON finance_ledger
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "finance_write" ON finance_ledger
  FOR ALL TO authenticated USING (true);

-- Risk scores: authenticated can read/write
CREATE POLICY "risk_read" ON student_risk_scores
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "risk_write" ON student_risk_scores
  FOR ALL TO authenticated USING (true);
