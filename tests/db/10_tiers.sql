-- Staff tiers: administrators, lab instructors, faculty and students each see and change only
-- what their tier allows (migration 47).
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
create or replace function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.back() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); end $$;
create or replace function pg_temp.ok(c boolean, t text, i text default '') returns void language sql as $$ insert into r(ok, test, info) values (c, t, i) $$;

do $$
declare
  dept uuid := (select id from departments limit 1); term uuid := current_term_id();
  adm uuid := gen_random_uuid(); mixed uuid := gen_random_uuid(); lab uuid := gen_random_uuid(); fac uuid := gen_random_uuid();
  other uuid := gen_random_uuid(); st uuid := gen_random_uuid(); st2 uuid := gen_random_uuid();
  mine uuid; theirs uuid; e_lab uuid; e_theory uuid; n int; ok boolean; grad int := section_grad_year('II CSE-T', current_term_id());
begin
  insert into auth.users (id, email, aud, role) select x, 'tier-' || x || '@example.test', 'authenticated', 'authenticated' from unnest(array[adm, mixed, lab, fac, other, st, st2]) x;
  insert into profiles (id, role, department_id, full_name, email, is_active, staff_type, is_admin, section, batch_year) values
    (adm,   'PROFESSOR', dept, 'T Admin', 'tadm@example.test', true, 'ADMIN', false, null, null),
    (mixed, 'PROFESSOR', dept, 'T Mixed', 'tmix@example.test', true, 'TEACHING', true, null, null),
    (lab,   'PROFESSOR', dept, 'T Lab',   'tlab@example.test', true, 'LAB', false, null, null),
    (fac,   'PROFESSOR', dept, 'T Fac',   'tfac@example.test', true, 'TEACHING', false, null, null),
    (other, 'PROFESSOR', dept, 'T Other', 'toth@example.test', true, 'TEACHING', false, null, null),
    (st,    'STUDENT',   dept, 'T Stu',   'tst@example.test',  true, 'TEACHING', false, 'II CSE-T', grad),
    (st2,   'STUDENT',   dept, 'T Stu2',  'tst2@example.test', true, 'TEACHING', false, 'III CSE-U', grad - 1);
  insert into subjects (code, name, semester, section, term_id, audience, faculty_id, course_type) values ('TT01', 'Mine', 3, 'II CSE-T', term, 'ALL', fac, 'LAB') returning id into mine;
  insert into subjects (code, name, semester, section, term_id, audience, faculty_id, course_type) values ('TT02', 'Theirs', 5, 'III CSE-U', term, 'ALL', other, 'THEORY') returning id into theirs;
  insert into marks (student_id, subject_id, faculty_id, exam_type, marks_obtained, max_marks) values (st, mine, fac, 'CIA1_CT', 20, 30), (st2, theirs, other, 'CIA1_CT', 25, 30);
  insert into period_slots (term_id, period_no, starts_at, ends_at) values (term, 10, '00:00', '23:40') on conflict (term_id, period_no) do update set starts_at = '00:00', ends_at = '23:40';
  insert into timetable_entries (term_id, section, day_order, period_no, subject_id, audience, is_lab) values (term, 'II CSE-T', 1, 10, mine, 'ALL', true) returning id into e_lab;
  insert into timetable_entries (term_id, section, day_order, period_no, subject_id, audience, is_lab) values (term, 'III CSE-U', 1, 10, theirs, 'ALL', false) returning id into e_theory;

  -- administrator
  perform pg_temp.as_user(adm);
  select count(*) into n from marks; perform pg_temp.ok(n = 0, 'an administrator sees no marks', n::text);
  select count(*) into n from timetable_entries where id in (e_lab, e_theory); perform pg_temp.ok(n = 0, 'an administrator sees no timetable', n::text);
  select count(*) into n from profiles where id in (st, st2); perform pg_temp.ok(n = 2, 'an administrator sees students (to manage accounts)', n::text);
  insert into subjects (code, name, semester, section, term_id, audience) values ('TT03', 'Added by admin', 3, 'II CSE-T', term, 'ALL');
  perform pg_temp.ok(true, 'an administrator adds a course');
  update profiles set roll_number = '99ZZ001' where id = st; get diagnostics n = row_count; perform pg_temp.ok(n = 1, 'an administrator corrects a student record', n::text);
  begin update profiles set access_tier = 1 where id = fac; perform pg_temp.ok(false, 'an administrator cannot make anyone tier 1', 'allowed');
  exception when others then perform pg_temp.ok(true, 'an administrator cannot make anyone tier 1', 'refused'); end;
  begin update profiles set is_admin = true where id = other; perform pg_temp.ok(false, 'an administrator cannot hand out administrator powers', 'allowed');
  exception when others then perform pg_temp.ok(true, 'an administrator cannot hand out administrator powers', 'refused'); end;
  perform pg_temp.ok(not att_can_take(mine, 'II CSE-T', e_lab, ist_today()), 'an administrator cannot take attendance');
  perform pg_temp.back();

  -- faculty + administrator
  perform pg_temp.as_user(mixed);
  perform pg_temp.ok(is_admin_staff() and is_staff(), 'a faculty member with administrator powers is both');
  perform pg_temp.back();

  -- lab instructor
  perform pg_temp.as_user(lab);
  perform pg_temp.ok(att_can_take(mine, 'II CSE-T', e_lab, ist_today()), 'a lab instructor takes a lab hour during the hour');
  perform pg_temp.ok(not att_can_take(theirs, 'III CSE-U', e_theory, ist_today()), 'a lab instructor cannot take a theory hour');
  perform pg_temp.ok(not att_can_take(mine, 'II CSE-T', e_lab, ist_today() - 1), 'a lab instructor cannot take a past lab hour');
  select count(*) into n from marks; perform pg_temp.ok(n = 0, 'a lab instructor sees no marks', n::text);
  perform pg_temp.back();

  -- faculty: marks of own course only
  perform pg_temp.as_user(fac);
  select count(*) into n from marks where subject_id = mine; perform pg_temp.ok(n = 1, 'a teacher sees the marks of their course', n::text);
  select count(*) into n from marks where subject_id = theirs; perform pg_temp.ok(n = 0, 'a teacher cannot see marks of a course they do not teach', n::text);
  begin insert into subjects (code, name, semester, term_id, audience) values ('TT04', 'x', 3, term, 'ALL'); perform pg_temp.ok(false, 'a plain teacher cannot add courses', 'allowed');
  exception when others then perform pg_temp.ok(true, 'a plain teacher cannot add courses', 'refused'); end;
  perform pg_temp.back();

  -- student: own class only
  perform pg_temp.as_user(st);
  select count(*) into n from subjects where id in (mine, theirs); perform pg_temp.ok(n = 1, 'a student sees only their own class''s courses', n::text);
  select count(*) into n from timetable_entries where id in (e_lab, e_theory); perform pg_temp.ok(n = 1, 'a student sees only their own class''s timetable', n::text);
  select count(*) into n from profiles where id = st2; perform pg_temp.ok(n = 0, 'a student cannot see other students', n::text);
  perform pg_temp.back();
end $$;
select ok, test, info from r order by n;
rollback;
