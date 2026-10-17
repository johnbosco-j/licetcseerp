-- Conflict check on saving an hour, copying a timetable into a new term,
-- the new analysis reports, and two-factor protection of HOD powers.
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
do $$
declare
  dept uuid := (select id from departments limit 1);
  hod uuid := gen_random_uuid(); fa uuid := gen_random_uuid(); fadv uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  t1 uuid; t2 uuid; toc1 uuid; toc2 uuid; el1 uuid; el2 uuid; gone uuid;
  s attendance_sessions; opened timestamptz; msg text; n int;
  today date := ist_today();
  claims text;
begin
  insert into auth.users (id, email, aud, role) select x, 'cc-' || x || '@example.test', 'authenticated', 'authenticated'
    from unnest(array[hod, fa, fadv, st]) x;
  insert into profiles (id, role, department_id, full_name, email, is_active, advisor_section, section, batch_year) values
    (hod,  'HOD',       dept, 'C HOD',        'chod@example.test', true, null, null, null),
    (fa,   'PROFESSOR', dept, 'C Instructor', 'cfa@example.test',  true, null, null, null),
    (fadv, 'PROFESSOR', dept, 'C Advisor',    'cadv@example.test', true, 'III CSE-Y', null, null),
    (st,   'STUDENT',   dept, 'C Student',    'cst@example.test',  true, null, 'III CSE-Y', 2099);
  insert into academic_terms (academic_year, parity, label, starts_on, ends_on) values ('2095-2096', 'ODD', 'C TERM 1', today - 30, today + 30) returning id into t1;
  insert into academic_terms (academic_year, parity, label, starts_on, ends_on) values ('2096-2097', 'ODD', 'C TERM 2', today + 300, today + 400) returning id into t2;
  insert into period_slots (term_id, period_no, starts_at, ends_at) values (t1, 1, '00:00', '00:01');
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience, faculty_id) values ('CTOC', 'C TOC', 5, 'III CSE-Y', t1, 2099, 'ALL', fa) returning id into toc1;
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience, audience_value) values ('CEL', 'C Elective', 5, null, t1, 2099, 'VERTICAL', 'FSD') returning id into el1;
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience) values ('CGONE', 'C Dropped', 5, 'III CSE-Y', t1, 2099, 'ALL') returning id into gone;
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience) values ('CTOC', 'C TOC', 5, 'III CSE-Y', t2, 2100, 'ALL') returning id into toc2;
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience, audience_value) values ('CEL', 'C Elective', 5, null, t2, 2100, 'VERTICAL', 'FSD') returning id into el2;
  insert into subject_faculty (subject_id, faculty_id) values (toc1, fa);
  insert into timetable_entries (term_id, section, day_order, period_no, subject_id, audience, audience_value, label, takes_attendance) values
    (t1, 'III CSE-Y', 1, 1, toc1, 'ALL', null, null, true),
    (t1, 'III CSE-Y', 1, 2, el1, 'VERTICAL', 'FSD', null, true),
    (t1, 'III CSE-Y', 1, 3, null, 'ALL', null, 'Library', false),
    (t1, 'III CSE-Y', 1, 4, gone, 'ALL', null, null, true);

  -- conflict check -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  s := att_open(today, 1::smallint, 'III CSE-Y', toc1, null, 'ALL', null, null, null);
  -- the instructor's copy is from a minute ago (inside one test transaction now() does not move)
  opened := s.updated_at - interval '1 minute';
  perform set_config('request.jwt.claims', json_build_object('sub', fadv, 'role', 'authenticated')::text, true);
  s := att_save(s.id, '{}', 'advisor edit', false, null, null, null, s.updated_at);
  insert into r(ok, test, info) values (true, 'first save with an up-to-date copy goes through', 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin
    perform att_save(s.id, '{}', 'instructor edit', false, null, null, null, opened);
    insert into r(ok, test, info) values (false, 'a stale copy cannot overwrite a colleague''s newer save', 'allowed');
  exception when others then
    get stacked diagnostics msg = message_text;
    insert into r(ok, test, info) values (msg like '%changed by C Advisor%', 'a stale copy cannot overwrite a colleague''s newer save', msg);
  end;
  s := att_save(s.id, '{}', 'instructor edit', false, null, null, null, s.updated_at);
  insert into r(ok, test, info) values (s.topic = 'instructor edit', 'saving again from the latest copy works', s.topic);
  s := att_save(s.id, '{}', 'no check', false, null, null, null, null);
  insert into r(ok, test, info) values (s.topic = 'no check', 'callers without a copy time still save (station, old clients)', s.topic);

  -- copy timetable ---------------------------------------------------------------
  begin
    perform copy_timetable(t1, t2, array['III CSE-Y']);
    insert into r(ok, test, info) values (false, 'faculty cannot copy timetables', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'faculty cannot copy timetables', 'refused'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', hod, 'role', 'authenticated')::text, true);
  select copied into n from copy_timetable(t1, t2, array['III CSE-Y']);
  insert into r(ok, test, info) values (n = 3, 'HOD copies the hours whose course exists in the new term (+ labels)', n || ' copied');
  insert into r(ok, test, info) values (exists (select 1 from timetable_entries where term_id = t2 and period_no = 1 and subject_id = toc2),
    'section course is mapped to the new term''s offering', 'ok');
  insert into r(ok, test, info) values (exists (select 1 from timetable_entries where term_id = t2 and period_no = 2 and subject_id = el2),
    'combined course is mapped to the next batch''s offering', 'ok');
  insert into r(ok, test, info) values (not exists (select 1 from timetable_entries where term_id = t2 and period_no = 4),
    'hours of a course not offered any more are skipped', 'ok');
  select coalesce(sum(copied), 0) into n from copy_timetable(t1, t2, array['III CSE-Y']);
  insert into r(ok, test, info) values (n = 0, 'copying again never overwrites or duplicates', n || ' copied');

  -- analysis privacy -------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', st, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values ((select count(*) from ana_topics(t1, null, null)) = 0, 'students get no topic log', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_self_checkin(t1)) = 0, 'students get no self check-in report', 'ok');
  insert into r(ok, test, info) values ((select count(*) from ana_missing_hours(t1, null, null)) = 0, 'students get no missing-hours list', 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values ((select count(*) from ana_topics(t1, null, null) where topic = 'no check') = 1, 'staff see the topic log', 'ok');

  -- two-factor for HOD powers -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', hod, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  insert into r(ok, test, info) values (is_hod(), 'HOD without an authenticator keeps HOD powers', 'ok');
  insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), hod, 'test', 'totp', 'verified', now(), now());
  insert into r(ok, test, info) values (not is_hod(), 'once an authenticator is set up, a password-only session has no HOD powers', 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', hod, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into r(ok, test, info) values (is_hod(), 'a session confirmed with the authenticator has HOD powers', 'ok');
  perform set_config('request.jwt.claims', '', true);
end $$;
select ok, test, info from r order by n;
rollback;
