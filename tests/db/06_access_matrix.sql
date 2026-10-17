-- Access matrix: what each role can see and change, checked as that role with row
-- level security in force (the test switches to the `authenticated` role; queries as
-- the database owner would bypass RLS). Fixtures are rolled back.
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;

do $$
declare
  dept uuid := (select id from departments limit 1);
  hod uuid := gen_random_uuid(); fac uuid := gen_random_uuid(); adv uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid(); sx uuid := gen_random_uuid();
  t uuid := current_term_id(); subj uuid;
begin
  insert into auth.users (id, email, aud, role) select x, 'am-' || x || '@example.test', 'authenticated', 'authenticated'
    from unnest(array[hod, fac, adv, sa, sb, sx]) x;
  insert into profiles (id, role, department_id, full_name, email, is_active, advisor_section, section, batch_year) values
    (hod, 'HOD',       dept, 'M HOD',     'mhod@example.test', true, null, null, null),
    (fac, 'PROFESSOR', dept, 'M Faculty', 'mfac@example.test', true, null, null, null),
    (adv, 'PROFESSOR', dept, 'M Advisor', 'madv@example.test', true, 'II CSE-Q', null, null),
    (sa,  'STUDENT',   dept, 'M Student A', 'msa@example.test', true, null, 'II CSE-Q', 2099),
    (sb,  'STUDENT',   dept, 'M Student B', 'msb@example.test', true, null, 'II CSE-Q', 2099),
    (sx,  'STUDENT',   dept, 'M Student X', 'msx@example.test', true, null, 'II CSE-W', 2099);
  insert into subjects (code, name, semester, section, term_id, audience) values ('MTEST', 'Matrix test', 3, 'II CSE-Q', t, 'ALL') returning id into subj;
  insert into marks (student_id, subject_id, faculty_id, exam_type, marks_obtained, max_marks) values (sa, subj, hod, 'CIA1_CT', 20, 30), (sb, subj, hod, 'CIA1_CT', 25, 30);
  insert into grievances (student_id, category, subject_line, description) values (sa, 'ACADEMIC', 'A complaint', 'about a teacher'), (sb, 'ACADEMIC', 'B complaint', 'private');
  insert into leaves (applicant_id, leave_type, from_date, to_date, reason) values (sa, 'MEDICAL', current_date, current_date, 'fever'), (sx, 'MEDICAL', current_date, current_date, 'fever');
  insert into placement_offers (student_id, student_name, company_name) values (sa, 'M Student A', 'Acme'), (sb, 'M Student B', 'Acme');
  insert into attendance_pins (student_id, pin_hash) values (sa, 'x');
  insert into attendance_sessions (term_id, date, period_no, section, subject_id, roster, absent, mode, status)
    values (t, current_date - 400, 1, 'II CSE-Q', subj, array[sa, sb], array[sb], 'IMPORT', 'SUBMITTED');
  insert into ids values ('hod', hod), ('fac', fac), ('adv', adv), ('sa', sa), ('sb', sb), ('sx', sx), ('subj', subj);
end $$;

-- run a check as a given person (RLS in force)
create or replace function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ── a student ───────────────────────────────────────────────────────────────
do $$
declare me uuid := (select v from ids where k = 'sa'); n int; msg text;
begin
  perform pg_temp.as_user(me);
  insert into r(ok, test, info) select count(*) = 1, 'student sees only their own student profile', count(*)::text from profiles where role = 'STUDENT' and email like 'ms%@example.test';
  insert into r(ok, test, info) select count(*) = 1, 'student sees only their own marks', count(*)::text from marks where subject_id = (select v from ids where k = 'subj');
  insert into r(ok, test, info) select count(*) = 0, 'student cannot read class registers (they name classmates)', count(*)::text from attendance_sessions where subject_id = (select v from ids where k = 'subj');
  insert into r(ok, test, info) select count(*) = 0, 'nobody reads attendance PINs, not even the owner', count(*)::text from attendance_pins;
  insert into r(ok, test, info) select count(*) = 1, 'student sees only their own grievance', count(*)::text from grievances where subject_line like '_ complaint';
  insert into r(ok, test, info) select count(*) = 1, 'student sees only their own leave', count(*)::text from leaves where reason = 'fever';
  insert into r(ok, test, info) select count(*) = 1, 'student sees only their own placement offer', count(*)::text from placement_offers where company_name = 'Acme';
  insert into r(ok, test, info) select count(*) = 0, 'student cannot read the finance ledger', count(*)::text from finance_ledger;
  insert into r(ok, test, info) select count(*) = 0, 'student cannot read the audit trail', count(*)::text from audit_log;
  insert into r(ok, test, info) select count(*) = 0, 'student cannot read the asset register', count(*)::text from inventory;
  update profiles set role = 'HOD' where id = me; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'student cannot make themselves HOD', n || ' rows');
  update profiles set section = 'IV CSE-A' where id = me; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'student cannot move themselves to another section', n || ' rows');
  update app_settings set value = '0' where key = 'attendance.min_percent'; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'student cannot change attendance rules', n || ' rows');
  begin
    insert into marks (student_id, subject_id, faculty_id, exam_type, marks_obtained, max_marks) values (me, (select v from ids where k = 'subj'), me, 'CIA2_CT', 30, 30);
    insert into r(ok, test, info) values (false, 'student cannot enter marks', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'student cannot enter marks', 'refused'); end;
  begin
    insert into timetable_entries (term_id, section, day_order, period_no, label) values (current_term_id(), 'II CSE-Q', 1, 1, 'Free');
    insert into r(ok, test, info) values (false, 'student cannot edit the timetable', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'student cannot edit the timetable', 'refused'); end;
  begin
    insert into attendance_sessions (date, period_no, section, label, roster) values (current_date, 1, 'II CSE-Q', 'x', '{}');
    insert into r(ok, test, info) values (false, 'student cannot create attendance', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'student cannot create attendance', 'refused'); end;
  perform set_config('role', 'postgres', true);
end $$;

-- ── a faculty member (not the advisor) ──────────────────────────────────────
do $$
declare me uuid := (select v from ids where k = 'fac'); n int;
begin
  perform pg_temp.as_user(me);
  insert into r(ok, test, info) select count(*) = 0, 'faculty cannot read students'' grievances', count(*)::text from grievances where subject_line like '_ complaint';
  insert into r(ok, test, info) select count(*) = 0, 'faculty cannot read leave of students they do not advise', count(*)::text from leaves where reason = 'fever';
  insert into r(ok, test, info) select count(*) = 0, 'faculty cannot read the finance ledger', count(*)::text from finance_ledger;
  insert into r(ok, test, info) select count(*) = 0, 'faculty cannot read the audit trail', count(*)::text from audit_log;
  insert into r(ok, test, info) select count(*) = 1, 'faculty can read class registers', count(*)::text from attendance_sessions where subject_id = (select v from ids where k = 'subj');
  update profiles set access_tier = 1 where id = me; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'faculty cannot raise their own access tier', n || ' rows');
  update grievances set status = 'RESOLVED' where subject_line like '_ complaint'; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'faculty cannot close grievances', n || ' rows');
  update marks set marks_obtained = 30 where subject_id = (select v from ids where k = 'subj'); get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'faculty cannot change marks of a course they do not teach', n || ' rows');
  update app_settings set value = '0' where key = 'attendance.min_percent'; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'faculty cannot change attendance rules', n || ' rows');
  perform set_config('role', 'postgres', true);
end $$;

-- ── the class advisor ───────────────────────────────────────────────────────
do $$
declare me uuid := (select v from ids where k = 'adv'); n int;
begin
  perform pg_temp.as_user(me);
  insert into r(ok, test, info) select count(*) = 1, 'advisor sees leave of their own section only', count(*)::text from leaves where reason = 'fever';
  update leaves set status = 'APPROVED' where reason = 'fever'; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 1, 'advisor can decide leave for their section only', n || ' rows');
  insert into r(ok, test, info) select count(*) = 0, 'advisor cannot read grievances', count(*)::text from grievances where subject_line like '_ complaint';
  perform set_config('role', 'postgres', true);
end $$;

-- ── the HOD ─────────────────────────────────────────────────────────────────
do $$
declare me uuid := (select v from ids where k = 'hod'); n int;
begin
  perform pg_temp.as_user(me);
  insert into r(ok, test, info) select count(*) = 2, 'HOD reads every grievance', count(*)::text from grievances where subject_line like '_ complaint';
  insert into r(ok, test, info) select count(*) = 2, 'HOD reads every leave', count(*)::text from leaves where reason = 'fever';
  update finance_ledger set amount = amount + 1; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'finance ledger entries cannot be edited, even by the HOD', n || ' rows');
  delete from audit_log; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'audit trail cannot be deleted, even by the HOD', n || ' rows');
  update profiles set section = 'II CSE-W' where id = (select v from ids where k = 'sa'); get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 1, 'HOD can edit a student record', n || ' rows');
  perform set_config('role', 'postgres', true);
end $$;

-- ── signed out ──────────────────────────────────────────────────────────────
do $$
declare bad text;
begin
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  insert into r(ok, test, info) values (bad is null, 'row level security is on for every table', coalesce(bad, 'all'));
  select string_agg(c.relname, ', ') into bad from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'));
  insert into r(ok, test, info) values (bad is null, 'signed-out visitors have no access to any table', coalesce(bad, 'none'));
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  insert into r(ok, test, info) values (bad is null, 'signed-out visitors cannot call any function', coalesce(bad, 'none'));
end $$;

select ok, test, info from r order by n;
rollback;
