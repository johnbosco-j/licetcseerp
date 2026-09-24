-- Examination Policy §16 (Secure EMS): course-bound faculty access and an
-- immutable audit trail of every change to academic records.

-- ── 16.1 Faculty may only edit marks/attendance for courses they handle ─────
-- Unassigned subjects stay open to all faculty until the HOD allots them.
CREATE OR REPLACE FUNCTION public.can_edit_subject(p_subject UUID, p_kind TEXT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_hod() OR (
    is_staff()
    AND NOT subject_locked(p_subject, p_kind)
    AND COALESCE((SELECT faculty_id IS NULL OR faculty_id = auth.uid() FROM subjects WHERE id = p_subject), false)
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_edit_subject(UUID, TEXT) FROM anon;

DROP POLICY IF EXISTS marks_insert ON marks;
DROP POLICY IF EXISTS marks_update ON marks;
CREATE POLICY marks_insert ON marks FOR INSERT TO authenticated WITH CHECK (can_edit_subject(subject_id, 'MARKS'));
CREATE POLICY marks_update ON marks FOR UPDATE TO authenticated
  USING (can_edit_subject(subject_id, 'MARKS')) WITH CHECK (can_edit_subject(subject_id, 'MARKS'));

DROP POLICY IF EXISTS attendance_insert ON attendance;
DROP POLICY IF EXISTS attendance_update ON attendance;
CREATE POLICY attendance_insert ON attendance FOR INSERT TO authenticated WITH CHECK (can_edit_subject(subject_id, 'ATTENDANCE'));
CREATE POLICY attendance_update ON attendance FOR UPDATE TO authenticated
  USING (can_edit_subject(subject_id, 'ATTENDANCE')) WITH CHECK (can_edit_subject(subject_id, 'ATTENDANCE'));

-- ── 16.2 Immutable audit log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor      UUID,
  actor_role TEXT,
  action     TEXT NOT NULL,
  table_name TEXT NOT NULL,
  row_id     TEXT,
  old_data   JSONB,
  new_data   JSONB,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at    ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_log(table_name, at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_select ON audit_log;
CREATE POLICY audit_select ON audit_log FOR SELECT TO authenticated USING (is_hod());

CREATE OR REPLACE FUNCTION public.audit_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  headers JSON;
  rec JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
  BEGIN headers := current_setting('request.headers', true)::json; EXCEPTION WHEN others THEN headers := NULL; END;
  INSERT INTO audit_log (actor, actor_role, action, table_name, row_id, old_data, new_data, ip)
  VALUES (
    auth.uid(),
    COALESCE(current_user_role()::text, CASE WHEN auth.uid() IS NULL THEN 'SYSTEM' END),
    TG_OP, TG_TABLE_NAME, rec->>'id',
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    split_part(COALESCE(headers->>'x-forwarded-for', headers->>'x-real-ip', ''), ',', 1)
  );
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION public.audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['marks','attendance','day_attendance','subject_locks','subjects','profiles',
                           'finance_ledger','leaves','grievances','attendance_alerts','promotion_log','inventory','placements']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON %1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$I FOR EACH ROW EXECUTE FUNCTION audit_row()', t);
  END LOOP;
END $$;
