-- Analysis functions return data to staff only; students and signed-out callers get nothing.
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;
do $$
declare
  dept uuid := (select id from departments limit 1);
  fa uuid := gen_random_uuid(); st uuid := gen_random_uuid(); t uuid; sub uuid;
begin
  insert into auth.users (id, email, aud, role) values (fa, 'f3@example.test', 'authenticated', 'authenticated'), (st, 's3@example.test', 'authenticated', 'authenticated');
  insert into profiles (id, role, department_id, full_name, email, is_active) values (fa, 'PROFESSOR', dept, 'T Fac', 'f3@example.test', true);
  insert into profiles (id, role, department_id, full_name, email, is_active, section, batch_year) values (st, 'STUDENT', dept, 'T Stu', 's3@example.test', true, 'II CSE-Z', 2099);
  insert into academic_terms (academic_year, parity, label) values ('2096-2097', 'EVEN', 'T') returning id into t;
  insert into subjects (code, name, semester, section, term_id) values ('TX', 'Test', 4, 'II CSE-Z', t) returning id into sub;
  insert into attendance_sessions (term_id, date, period_no, section, cohort_grad_year, subject_id, roster, absent, mode, status)
  values (t, ist_today() - 1, 1, 'II CSE-Z', 2099, sub, array[st], array[st], 'IMPORT', 'SUBMITTED');
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values ((select count(*) from ana_section_kpis(t)) = 1, 'staff see class KPIs', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_custom(t, null, null, null, null, 'student')) = 1, 'staff run the custom report', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_patterns(t, null)) = 1, 'staff see absence patterns', 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values ((select count(*) from ana_section_kpis(t)) = 0, 'students get no KPIs', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_custom(t, null, null, null, null, 'student')) = 0, 'students get no custom report', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_absence_streaks(t, 1)) = 0, 'students get no streak list', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_faculty_load(t, null, null)) = 0, 'students get no faculty figures', 'ok');
  perform set_config('request.jwt.claims', '', true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where email = 's3@example.test'), 'role', 'authenticated')::text, true);
do $$ begin perform att_alert_candidates(80); insert into r(ok, test, info) values (false, 'signed-in users cannot list alert candidates', 'allowed');
exception when others then insert into r(ok, test, info) values (true, 'signed-in users cannot list alert candidates', 'refused'); end $$;
reset role;
select ok, test, info from r order by n;
rollback;
