-- Head of Department in person: the HOD office account shares the person's courses;
-- only an active CSE faculty account can be named.
begin;
create temp table r (n serial, ok boolean, test text, info text);
do $$
declare
  dept uuid := (select id from departments limit 1);
  office uuid := gen_random_uuid(); person uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  visiting uuid := gen_random_uuid(); st uuid := gen_random_uuid(); subj uuid; ids uuid[];
begin
  insert into auth.users (id, email, aud, role) select x, 'hp-' || x || '@example.test', 'authenticated', 'authenticated'
    from unnest(array[office, person, other, visiting, st]) x;
  insert into profiles (id, role, department_id, full_name, email, is_active, home_department, section) values
    (office,   'HOD',       dept, 'H Office',   'hoff@example.test', true, null, null),
    (person,   'PROFESSOR', dept, 'H Person',   'hper@example.test', true, null, null),
    (other,    'PROFESSOR', dept, 'H Other',    'hoth@example.test', true, null, null),
    (visiting, 'PROFESSOR', dept, 'H Visiting', 'hvis@example.test', true, 'S&H', null),
    (st,       'STUDENT',   dept, 'H Student',  'hst@example.test',  true, null, 'II CSE-H');
  insert into subjects (code, name, semester, section, term_id, audience, faculty_id) values ('HP01', 'HOD course', 3, 'II CSE-H', current_term_id(), 'ALL', person) returning id into subj;

  begin
    update app_settings set value = to_jsonb(st::text) where key = 'hod.person';
    insert into r(ok, test, info) values (false, 'a student cannot be named Head of Department', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'a student cannot be named Head of Department', 'refused'); end;
  begin
    update app_settings set value = to_jsonb(visiting::text) where key = 'hod.person';
    insert into r(ok, test, info) values (false, 'staff of another department cannot be named Head of Department', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'staff of another department cannot be named Head of Department', 'refused'); end;
  update app_settings set value = to_jsonb(person::text) where key = 'hod.person';

  perform set_config('request.jwt.claims', json_build_object('sub', office, 'role', 'authenticated')::text, true);
  ids := my_teaching_ids();
  insert into r(ok, test, info) values (person = any(ids) and office = any(ids), 'HOD office account teaches as itself and the HOD in person', array_length(ids, 1)::text);
  insert into r(ok, test, info) values (teaches_subject(subj), 'HOD office account counts the person''s course as its own', 'ok');

  perform set_config('request.jwt.claims', json_build_object('sub', person, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values (teaches_subject(subj) and not is_hod(), 'the personal account keeps its course and gets no HOD powers', 'ok');

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  insert into r(ok, test, info) values (my_teaching_ids() = array[other] and not teaches_subject(subj), 'other faculty are unaffected', 'ok');
  perform set_config('request.jwt.claims', '', true);
end $$;

-- elective plan: everyone signed in reads it, only the HOD changes it
create or replace function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
do $$
declare st uuid := (select id from profiles where email = 'hst@example.test'); hod uuid := (select id from profiles where email = 'hoff@example.test'); n int;
begin
  perform pg_temp.as_user(st);
  begin
    insert into elective_plan (cohort_grad_year, slot, vertical, course_code) values (2099, 'PE1', 'AIML', 'PCS2444');
    insert into r(ok, test, info) values (false, 'a student cannot change the elective plan', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'a student cannot change the elective plan', 'refused'); end;
  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user(hod);
  insert into elective_plan (cohort_grad_year, slot, vertical, course_code) values (2099, 'PE1', 'AIML', 'PCS2444');
  get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 1, 'the HOD sets the elective plan', n || ' rows');
  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user(st);
  insert into r(ok, test, info) select count(*) = 1, 'students can read the plan', count(*)::text from elective_plan where cohort_grad_year = 2099;
  perform set_config('role', 'postgres', true);
end $$;
select ok, test, info from r order by n;
rollback;
