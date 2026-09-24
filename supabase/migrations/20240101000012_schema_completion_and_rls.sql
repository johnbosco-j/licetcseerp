-- ════════════════════════════════════════════════════════════════════════════
-- 1. Columns and constraints the application code depends on
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS roll_number     TEXT,
  ADD COLUMN IF NOT EXISTS register_number TEXT;

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Day-attendance locks are per section and have no subject.
ALTER TABLE subject_locks ADD COLUMN IF NOT EXISTS section TEXT;
ALTER TABLE subject_locks DROP CONSTRAINT IF EXISTS subject_locks_lock_type_check;
ALTER TABLE subject_locks ADD CONSTRAINT subject_locks_lock_type_check
  CHECK (lock_type IN ('ATTENDANCE', 'MARKS', 'BOTH', 'DAY_ATTENDANCE'));
CREATE UNIQUE INDEX IF NOT EXISTS subject_locks_day_unique
  ON subject_locks(section) WHERE lock_type = 'DAY_ATTENDANCE';

-- The attendance screen records LATE for day sessions.
ALTER TABLE day_attendance DROP CONSTRAINT IF EXISTS day_attendance_status_check;
ALTER TABLE day_attendance ADD CONSTRAINT day_attendance_status_check
  CHECK (status IN ('PRESENT', 'ABSENT', 'LATE'));

-- Deleting a student (auth user → profile) must remove their records instead of
-- failing on foreign keys.
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_fkey,
  ADD CONSTRAINT attendance_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_student_id_fkey,
  ADD CONSTRAINT marks_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_applicant_id_fkey,
  ADD CONSTRAINT leaves_applicant_id_fkey FOREIGN KEY (applicant_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE grievances DROP CONSTRAINT IF EXISTS grievances_student_id_fkey,
  ADD CONSTRAINT grievances_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE student_risk_scores DROP CONSTRAINT IF EXISTS student_risk_scores_student_id_fkey,
  ADD CONSTRAINT student_risk_scores_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE attendance_alerts DROP CONSTRAINT IF EXISTS attendance_alerts_student_id_fkey,
  ADD CONSTRAINT attendance_alerts_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE student_promotion_history DROP CONSTRAINT IF EXISTS student_promotion_history_student_id_fkey,
  ADD CONSTRAINT student_promotion_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Rows a student creates in announcements (feedback/surveys/appraisals) are
-- theirs; drop them with the student.
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_created_by_fkey,
  ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- One course-feedback submission per student per subject.
CREATE UNIQUE INDEX IF NOT EXISTS announcements_feedback_once
  ON announcements(created_by, audience) WHERE audience LIKE 'FEEDBACK:%';

CREATE INDEX IF NOT EXISTS idx_subjects_faculty         ON subjects(faculty_id);
CREATE INDEX IF NOT EXISTS idx_subjects_section_sem     ON subjects(section, semester);
CREATE INDEX IF NOT EXISTS idx_announcements_audience   ON announcements(audience, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_day_attendance_sec_date  ON day_attendance(section, date);
CREATE INDEX IF NOT EXISTS idx_leaves_applicant         ON leaves(applicant_id);
CREATE INDEX IF NOT EXISTS idx_grievances_student       ON grievances(student_id);
CREATE INDEX IF NOT EXISTS idx_alerts_student           ON attendance_alerts(student_id, date DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Role helpers
-- SECURITY DEFINER so policies on profiles can call them without recursing.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_user_role() IN ('HOD', 'PROFESSOR'), false)
$$;

CREATE OR REPLACE FUNCTION public.is_hod() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_user_role() = 'HOD', false)
$$;

CREATE OR REPLACE FUNCTION public.current_user_section() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT section FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.subject_locked(p_subject UUID, p_kind TEXT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM subject_locks
    WHERE subject_id = p_subject AND lock_type IN (p_kind, 'BOTH')
  )
$$;

CREATE OR REPLACE FUNCTION public.day_locked(p_section TEXT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM subject_locks
    WHERE subject_id IS NULL AND lock_type = 'DAY_ATTENDANCE' AND section = p_section
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_role(), public.is_staff(), public.is_hod(),
  public.current_user_section(), public.subject_locked(UUID, TEXT), public.day_locked(TEXT) FROM anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Replace every existing policy
-- The earlier migrations granted FOR ALL USING (true) to any signed-in user,
-- which let students edit their own marks or set their role to HOD.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE departments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance                ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_attendance            ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_locks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements             ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE grievances                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE placements                ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_ledger            ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_alerts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_promotion_history ENABLE ROW LEVEL SECURITY;

-- Departments
CREATE POLICY departments_select ON departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_hod    ON departments FOR ALL    TO authenticated USING (is_hod()) WITH CHECK (is_hod());

-- Profiles: students see themselves and staff; only the HOD edits.
CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_staff() OR role IN ('HOD', 'PROFESSOR'));
CREATE POLICY profiles_insert ON profiles FOR INSERT TO authenticated WITH CHECK (is_hod());
CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated USING (is_hod()) WITH CHECK (is_hod());
CREATE POLICY profiles_delete ON profiles FOR DELETE TO authenticated USING (is_hod());

-- Subjects
CREATE POLICY subjects_select ON subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY subjects_insert ON subjects FOR INSERT TO authenticated WITH CHECK (is_hod());
CREATE POLICY subjects_update ON subjects FOR UPDATE TO authenticated USING (is_hod()) WITH CHECK (is_hod());
CREATE POLICY subjects_delete ON subjects FOR DELETE TO authenticated USING (is_hod());

-- Subject attendance: staff write unless the HOD has locked the subject.
CREATE POLICY attendance_select ON attendance FOR SELECT TO authenticated
  USING (is_staff() OR student_id = auth.uid());
CREATE POLICY attendance_insert ON attendance FOR INSERT TO authenticated
  WITH CHECK (is_hod() OR (is_staff() AND NOT subject_locked(subject_id, 'ATTENDANCE')));
CREATE POLICY attendance_update ON attendance FOR UPDATE TO authenticated
  USING (is_hod() OR (is_staff() AND NOT subject_locked(subject_id, 'ATTENDANCE')))
  WITH CHECK (is_hod() OR (is_staff() AND NOT subject_locked(subject_id, 'ATTENDANCE')));
CREATE POLICY attendance_delete ON attendance FOR DELETE TO authenticated USING (is_hod());

-- Day (session) attendance
CREATE POLICY day_att_select ON day_attendance FOR SELECT TO authenticated
  USING (is_staff() OR student_id = auth.uid());
CREATE POLICY day_att_insert ON day_attendance FOR INSERT TO authenticated
  WITH CHECK (is_hod() OR (is_staff() AND NOT day_locked(section)));
CREATE POLICY day_att_update ON day_attendance FOR UPDATE TO authenticated
  USING (is_hod() OR (is_staff() AND NOT day_locked(section)))
  WITH CHECK (is_hod() OR (is_staff() AND NOT day_locked(section)));
CREATE POLICY day_att_delete ON day_attendance FOR DELETE TO authenticated USING (is_hod());

-- Marks
CREATE POLICY marks_select ON marks FOR SELECT TO authenticated
  USING (is_staff() OR student_id = auth.uid());
CREATE POLICY marks_insert ON marks FOR INSERT TO authenticated
  WITH CHECK (is_hod() OR (is_staff() AND NOT subject_locked(subject_id, 'MARKS')));
CREATE POLICY marks_update ON marks FOR UPDATE TO authenticated
  USING (is_hod() OR (is_staff() AND NOT subject_locked(subject_id, 'MARKS')))
  WITH CHECK (is_hod() OR (is_staff() AND NOT subject_locked(subject_id, 'MARKS')));
CREATE POLICY marks_delete ON marks FOR DELETE TO authenticated USING (is_hod());

-- Locks: everyone can see them, only the HOD sets them.
CREATE POLICY locks_select ON subject_locks FOR SELECT TO authenticated USING (true);
CREATE POLICY locks_hod    ON subject_locks FOR ALL    TO authenticated USING (is_hod()) WITH CHECK (is_hod());

-- Announcements double as the store for notices, events, documents, timetables,
-- exam schedules, question papers, editor/NAAC docs and student submissions;
-- the audience prefix decides who may see or write each row.
CREATE POLICY announcements_select ON announcements FOR SELECT TO authenticated USING (
  created_by = auth.uid()
  OR (is_staff() AND (audience NOT LIKE 'APPRAISAL:%' OR is_hod()))
  OR audience IN ('ALL', 'STUDENTS', current_user_section())
  OR audience = 'TIMETABLE:' || current_user_section()
  OR audience LIKE 'EVENT:%'
  OR audience LIKE 'DOCUMENT:%'
  OR audience LIKE 'EXAM_SCHED:%'
);
CREATE POLICY announcements_insert ON announcements FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND (
    is_staff()
    OR audience LIKE 'FEEDBACK:%'
    OR audience LIKE 'SURVEY:%'
    OR audience LIKE 'APPRAISAL:%'
  )
);
CREATE POLICY announcements_update ON announcements FOR UPDATE TO authenticated
  USING (is_hod() OR (is_staff() AND (created_by = auth.uid() OR audience LIKE 'TIMETABLE:%')))
  WITH CHECK (is_staff());
CREATE POLICY announcements_delete ON announcements FOR DELETE TO authenticated
  USING (is_hod() OR (is_staff() AND (created_by = auth.uid() OR audience LIKE 'TIMETABLE:%')));

-- Leaves: anyone applies for themselves; the HOD decides.
CREATE POLICY leaves_select ON leaves FOR SELECT TO authenticated
  USING (applicant_id = auth.uid() OR is_hod());
CREATE POLICY leaves_insert ON leaves FOR INSERT TO authenticated
  WITH CHECK (applicant_id = auth.uid() AND status = 'PENDING');
CREATE POLICY leaves_update ON leaves FOR UPDATE TO authenticated USING (is_hod()) WITH CHECK (is_hod());
CREATE POLICY leaves_delete ON leaves FOR DELETE TO authenticated
  USING (is_hod() OR (applicant_id = auth.uid() AND status = 'PENDING'));

-- Grievances
CREATE POLICY grievances_select ON grievances FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_staff());
CREATE POLICY grievances_insert ON grievances FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());
CREATE POLICY grievances_update ON grievances FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY grievances_delete ON grievances FOR DELETE TO authenticated USING (is_hod());

-- Inventory
CREATE POLICY inventory_select ON inventory FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY inventory_hod    ON inventory FOR ALL    TO authenticated USING (is_hod()) WITH CHECK (is_hod());

-- Placements: visible to all, managed by the HOD.
CREATE POLICY placements_select ON placements FOR SELECT TO authenticated USING (true);
CREATE POLICY placements_hod    ON placements FOR ALL    TO authenticated USING (is_hod()) WITH CHECK (is_hod());

-- Finance ledger is append-only (the hash chain breaks if rows change).
CREATE POLICY finance_select ON finance_ledger FOR SELECT TO authenticated USING (is_hod());
CREATE POLICY finance_insert ON finance_ledger FOR INSERT TO authenticated
  WITH CHECK (is_hod() AND created_by = auth.uid());

-- Risk scores
CREATE POLICY risk_select ON student_risk_scores FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_staff());
CREATE POLICY risk_staff  ON student_risk_scores FOR ALL TO authenticated USING (is_staff()) WITH CHECK (is_staff());

-- Attendance alerts
CREATE POLICY alerts_select ON attendance_alerts FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_staff());
CREATE POLICY alerts_insert ON attendance_alerts FOR INSERT TO authenticated WITH CHECK (is_staff());
CREATE POLICY alerts_update ON attendance_alerts FOR UPDATE TO authenticated USING (is_staff()) WITH CHECK (is_staff());
CREATE POLICY alerts_delete ON attendance_alerts FOR DELETE TO authenticated USING (is_hod());

-- Promotion
CREATE POLICY prolog_select ON promotion_log FOR SELECT TO authenticated USING (is_staff());
CREATE POLICY prolog_hod    ON promotion_log FOR ALL    TO authenticated USING (is_hod()) WITH CHECK (is_hod());
CREATE POLICY sph_select    ON student_promotion_history FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR is_staff());
CREATE POLICY sph_hod       ON student_promotion_history FOR ALL TO authenticated USING (is_hod()) WITH CHECK (is_hod());

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Storage: question papers and NAAC files are staff-only; department
--    documents are readable by everyone signed in.
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS auth_upload_qp   ON storage.objects;
DROP POLICY IF EXISTS auth_read_qp     ON storage.objects;
DROP POLICY IF EXISTS auth_delete_qp   ON storage.objects;
DROP POLICY IF EXISTS auth_upload_naac ON storage.objects;
DROP POLICY IF EXISTS auth_read_naac   ON storage.objects;
DROP POLICY IF EXISTS auth_delete_naac ON storage.objects;
DROP POLICY IF EXISTS auth_upload_docs ON storage.objects;
DROP POLICY IF EXISTS auth_read_docs   ON storage.objects;
DROP POLICY IF EXISTS auth_delete_docs ON storage.objects;

CREATE POLICY erp_staff_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('question-papers', 'naac-documents') AND public.is_staff());
CREATE POLICY erp_docs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dept-documents');
CREATE POLICY erp_staff_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('question-papers', 'naac-documents', 'dept-documents') AND public.is_staff());
CREATE POLICY erp_staff_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('question-papers', 'naac-documents', 'dept-documents') AND public.is_staff());
