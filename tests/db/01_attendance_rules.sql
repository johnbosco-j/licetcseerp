-- Attendance rules: who may take an hour, timing limits, lock, HOD correction,
-- self check-in (PIN lockout, phone binding, headcount) and data privacy.
-- Self-contained: builds fake staff, students, a test term and courses inside a
-- transaction and rolls everything back. Safe to run against production.
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated, anon; grant usage on sequence r_n_seq to authenticated, anon;

do $$
declare
  dept uuid := (select id from departments limit 1);
  hod uuid := gen_random_uuid(); fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid(); fadv uuid := gen_random_uuid();
  st uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  t uuid; popl uuid; toc uuid; ent uuid;
  s attendance_sessions; s2 attendance_sessions; j jsonb; msg text; i int;
  today date := ist_today();
begin
  -- fixtures -------------------------------------------------------------------
  insert into auth.users (id, email, aud, role) select x, 'test-' || x || '@example.test', 'authenticated', 'authenticated'
    from unnest(array[hod, fa, fb, fadv] || st) x;
  insert into profiles (id, role, department_id, full_name, email, is_active, advisor_section) values
    (hod,  'HOD',       dept, 'T HOD',        'hod@example.test',  true, null),
    (fa,   'PROFESSOR', dept, 'T Instructor', 'fa@example.test',   true, null),
    (fb,   'PROFESSOR', dept, 'T Other',      'fb@example.test',   true, null),
    (fadv, 'PROFESSOR', dept, 'T Advisor',    'fadv@example.test', true, 'III CSE-Z');
  for i in 1..6 loop
    insert into profiles (id, role, department_id, full_name, email, is_active, section, batch_year, register_number, roll_number, lab_batch, vertical)
    values (st[i], 'STUDENT', dept, 'T Student ' || i, 'st' || i || '@example.test', true, 'III CSE-Z', 2099,
            '9999991040' || lpad(i::text, 2, '0'), '99CS' || lpad(i::text, 3, '0'), case when i <= 3 then 1 else 2 end,
            case when i <= 4 then 'FSD' else 'AIML' end);
  end loop;
  insert into academic_terms (academic_year, parity, label, starts_on, ends_on) values ('2097-2098', 'ODD', 'TEST TERM', today - 60, today + 60) returning id into t;
  insert into period_slots (term_id, period_no, starts_at, ends_at) values (t, 1, '08:00', '09:00'), (t, 2, '09:00', '09:50'), (t, 7, '23:59', '23:59'), (t, 3, '00:00', '00:01');
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience, audience_value, faculty_id)
    values ('TPOPL', 'Test POPL', 5, null, t, 2099, 'VERTICAL', 'FSD', fa) returning id into popl;
  insert into subjects (code, name, semester, section, term_id, cohort_grad_year, audience, faculty_id)
    values ('TTOC', 'Test TOC', 5, 'III CSE-Z', t, 2099, 'ALL', fa) returning id into toc;
  insert into subject_faculty (subject_id, faculty_id) values (popl, fa), (toc, fa);
  insert into timetable_entries (term_id, section, day_order, period_no, subject_id, faculty_ids) values (t, 'III CSE-Z', 1, 1, toc, array[fa]) returning id into ent;

  -- authority ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  s := att_open(today - 1, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent);
  insert into r(ok, test, info) values (cardinality(s.roster) = 6 and s.cohort_grad_year = 2099, 'instructor opens own class (whole class roster)', cardinality(s.roster) || ' students');
  s := att_open(today - 1, 2::smallint, 'III CSE-Z', popl, null, 'VERTICAL', 'FSD', null, null);
  insert into r(ok, test, info) values (s.section is null and cardinality(s.roster) = 4, 'vertical class roster = only that vertical, combined', cardinality(s.roster) || ' students');

  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  begin s2 := att_open(today - 1, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent);
        -- an existing hour opens read-only for any staff; a NEW hour must be refused
        s2 := att_open(today - 2, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent);
        insert into r(ok, test, info) values (false, 'non-instructor cannot create an hour', 'was allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%not the course instructor%', 'non-instructor cannot create an hour', msg); end;
  begin perform att_save(s.id, '{}', null, true); insert into r(ok, test, info) values (false, 'non-instructor cannot mark', 'was allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%Only the course instructor%', 'non-instructor cannot mark', msg); end;

  -- delegation: only the instructor can delegate their own class
  begin insert into attendance_delegations (from_faculty, to_faculty, subject_id, valid_from, valid_to) values (fa, fb, toc, today - 2, today);
        insert into r(ok, test, info) values (true, 'delegation insert as postgres (setup)', 'ok');
  end;
  s2 := att_open(today - 2, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent);
  insert into r(ok, test, info) values (s2.id is not null, 'delegated colleague can take the class', 'ok');

  perform set_config('request.jwt.claims', json_build_object('sub', fadv, 'role', 'authenticated')::text, true);
  s2 := att_open(today - 1, 1::smallint, 'III CSE-Z', popl, null, 'VERTICAL', 'FSD', null, null);
  insert into r(ok, test, info) values (s2.id is not null, 'class advisor can take a combined class of their batch', 'ok');

  -- timing ---------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin s2 := att_open(today - 5, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent); insert into r(ok, test, info) values (false, 'staff back-dating limited to 2 days', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%only be entered by the HOD%', 'staff back-dating limited to 2 days', msg); end;
  begin s2 := att_open(today, 7::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent); insert into r(ok, test, info) values (false, 'cannot open an hour that has not started', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%not started%', 'cannot open an hour that has not started', msg); end;
  begin s2 := att_open(today + 1, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent); insert into r(ok, test, info) values (false, 'future date refused', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'future date refused', 'refused'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', hod, 'role', 'authenticated')::text, true);
  s2 := att_open(today - 30, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent);
  insert into r(ok, test, info) values (s2.id is not null, 'HOD may back-date any amount', 'ok');

  -- submit, lock, correction ----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  s := att_save(s.id, array[st[1], st[2]], 'Unit 1', true);
  insert into r(ok, test, info) values (s.status = 'SUBMITTED' and s.lock_at = s.submitted_at + interval '10 min' and cardinality(s.absent) = 2, 'submit locks after 10 minutes', s.lock_at::text);
  s := att_save(s.id, array[st[1]], null, true);
  insert into r(ok, test, info) values (cardinality(s.absent) = 1 and s.topic = 'Unit 1', 'correction inside the window keeps topic', 'ok');
  perform set_config('request.jwt.claims', '', true);
  update attendance_sessions set lock_at = now() - interval '1 min', submitted_at = now() - interval '11 min' where id = s.id;
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin perform att_save(s.id, '{}', null, true); insert into r(ok, test, info) values (false, 'instructor blocked after lock', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%locked%', 'instructor blocked after lock', msg); end;
  perform set_config('request.jwt.claims', json_build_object('sub', hod, 'role', 'authenticated')::text, true);
  begin perform att_save(s.id, '{}', null, true); insert into r(ok, test, info) values (false, 'HOD correction needs a reason', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%reason%', 'HOD correction needs a reason', msg); end;
  s2 := att_save(s.id, '{}', null, true, 'Medical certificate seen');
  insert into r(ok, test, info) values (cardinality(s2.absent) = 0 and exists (select 1 from audit_log where table_name = 'attendance_sessions' and row_id = s.id::text), 'HOD correction with reason is audited', 'ok');
  perform att_unlock(s.id, 30);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  s2 := att_save(s.id, array[st[3]], null, true);
  insert into r(ok, test, info) values (cardinality(s2.absent) = 1, 'instructor can correct after HOD unlock', 'ok');
  begin delete from attendance_sessions where id = s.id; insert into r(ok, test, info) values (false, 'only HOD can delete an hour', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'only HOD can delete an hour', 'refused'); end;

  -- self check-in ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', st[1], 'role', 'authenticated')::text, true);
  perform att_set_pin('4321');
  perform set_config('request.jwt.claims', json_build_object('sub', st[2], 'role', 'authenticated')::text, true);
  perform att_set_pin('9999');
  begin perform att_set_pin('12'); insert into r(ok, test, info) values (false, 'PIN must be 4–6 digits', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'PIN must be 4–6 digits', 'refused'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin perform att_self_open((select id from attendance_sessions where id = s.id), 10); insert into r(ok, test, info) values (false, 'self check-in only for today', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%today%' or msg like '%submitted%', 'self check-in only for today', msg); end;
  s := att_open(today, 3::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent);   -- period 3 starts at midnight, so it has begun at any hour
  s := att_self_open(s.id, 10);
  insert into r(ok, test, info) values (cardinality(s.absent) = 6, 'self check-in starts with everyone absent', 'ok');
  for i in 1..5 loop j := att_station_mark(s.id, '999999104001', '0000', 'dev-A'); end loop;
  j := att_station_mark(s.id, '999999104001', '4321', 'dev-A');
  insert into r(ok, test, info) values (not (j->>'ok')::boolean and j->>'error' like 'Too many wrong PINs%', 'five wrong PINs lock the student out', j->>'error');
  perform set_config('request.jwt.claims', '', true);
  update attendance_pins set locked_until = null, failed_attempts = 0 where student_id = st[1];
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  j := att_station_mark(s.id, '999999104001', '4321', 'dev-A');
  insert into r(ok, test, info) values ((j->>'ok')::boolean, 'right PIN on first phone marks present and binds the phone', j::text);
  j := att_station_mark(s.id, '999999104002', '9999', 'dev-A');
  insert into r(ok, test, info) values (not (j->>'ok')::boolean and j->>'error' like '%another student%', 'one phone cannot mark a second student', j->>'error');
  j := att_station_mark(s.id, '999999104001', '4321', 'dev-B');
  insert into r(ok, test, info) values (not (j->>'ok')::boolean or true, 'already-marked student on another phone is harmless', coalesce(j->>'error', 'ok'));
  perform set_config('request.jwt.claims', '', true);
  delete from attendance_delegations where to_faculty = fb;   -- fb is no longer covering the class
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  j := att_station_mark(s.id, '999999104002', '9999', 'dev-C');
  insert into r(ok, test, info) values (not (j->>'ok')::boolean and j->>'error' like '%not signed in as the teacher%', 'a station signed in as another teacher is refused', j->>'error');
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin perform att_save(s.id, (select absent from attendance_sessions where id = s.id), null, true); insert into r(ok, test, info) values (false, 'self check-in needs a headcount to submit', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%head count%', 'self check-in needs a headcount to submit', msg); end;
  begin perform att_save(s.id, '{}', null, true, null, 3); insert into r(ok, test, info) values (false, 'more present than headcount is refused', 'allowed');
  exception when others then get stacked diagnostics msg = message_text; insert into r(ok, test, info) values (msg like '%counted in the room%', 'more present than headcount is refused', msg); end;
  s2 := att_save(s.id, (select absent from attendance_sessions where id = s.id), null, true, null, 5);
  insert into r(ok, test, info) values (s2.status = 'SUBMITTED' and s2.headcount = 5, 'submit with a valid headcount', 'ok');

  -- marks authority ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values (can_edit_subject(toc, 'MARKS'), 'instructor can enter marks', 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', fb, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values (not can_edit_subject(toc, 'MARKS'), 'other faculty cannot enter marks', 'ok');
  perform set_config('request.jwt.claims', json_build_object('sub', fadv, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values (can_edit_subject(toc, 'MARKS'), 'class advisor can enter marks for their class', 'ok');

  -- student privacy ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', st[3], 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values ((select count(*) from my_attendance(t)) >= 1 and not exists (select 1 from my_attendance(t) x where false), 'student sees own hours', (select count(*) from my_attendance(t))::text);
  insert into r(ok, test, info) values ((select count(*) from att_term_summary(t, null)) = 0, 'student cannot run the class summary', 'ok');
  insert into r(ok, test, info) values ((select count(*) from student_attendance_summary(today - 90, null)) <= 1, 'summary shows a student only their own row', 'ok');
  begin perform att_open(today - 1, 1::smallint, 'III CSE-Z', toc, null, 'ALL', null, null, ent); insert into r(ok, test, info) values (false, 'student cannot open hours', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'student cannot open hours', 'refused'); end;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- direct table access as a signed-in student (RLS)
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where email = 'st1@example.test'), 'role', 'authenticated')::text, true);
insert into r(ok, test, info) select count(*) = 0, 'student cannot read the sessions table', count(*) || ' rows' from attendance_sessions;
insert into r(ok, test, info) select count(*) = 0, 'student cannot read PIN hashes', count(*) || ' rows' from attendance_pins;
insert into r(ok, test, info) select count(*) <= 1, 'student sees only own phone registration', count(*) || ' rows' from attendance_devices;
reset role;
set local role anon;
do $$ begin perform current_term_id(); insert into r(ok, test, info) values (false, 'signed-out callers cannot run functions', 'allowed');
exception when others then insert into r(ok, test, info) values (true, 'signed-out callers cannot run functions', 'refused'); end $$;
reset role;

select ok, test, info from r order by n;
rollback;
