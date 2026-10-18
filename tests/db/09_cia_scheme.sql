-- Assessment schemes: only the course's teachers / HOD set them; marks keep "AB" as absent.
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
create or replace function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
do $$
declare
  dept uuid := (select id from departments limit 1);
  t uuid := gen_random_uuid(); other uuid := gen_random_uuid(); st uuid := gen_random_uuid(); subj uuid;
  sch jsonb := '{"parts":[{"key":"T","label":"Theory","out_of":40}],"comps":[{"cia":1,"key":"CT","label":"CT","max":30,"weight":20,"part":"T"}]}';
begin
  insert into auth.users (id, email, aud, role) select x, 'cs-' || x || '@example.test', 'authenticated', 'authenticated' from unnest(array[t, other, st]) x;
  insert into profiles (id, role, department_id, full_name, email, is_active, section) values
    (t, 'PROFESSOR', dept, 'CS Teacher', 'cst@example.test', true, null), (other, 'PROFESSOR', dept, 'CS Other', 'cso@example.test', true, null),
    (st, 'STUDENT', dept, 'CS Student', 'css@example.test', true, 'II CSE-H');
  insert into subjects (code, name, semester, section, term_id, audience, faculty_id) values ('CS01', 'Scheme course', 3, 'II CSE-H', current_term_id(), 'ALL', t) returning id into subj;

  perform pg_temp.as_user(st);
  begin perform set_cia_scheme(subj, sch); insert into r(ok, test, info) values (false, 'a student cannot set a scheme', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'a student cannot set a scheme', 'refused'); end;
  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user(other);
  begin perform set_cia_scheme(subj, sch); insert into r(ok, test, info) values (false, 'another teacher cannot set the scheme', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'another teacher cannot set the scheme', 'refused'); end;
  perform set_config('role', 'postgres', true);
  perform pg_temp.as_user(t);
  perform set_cia_scheme(subj, sch);
  insert into marks (student_id, subject_id, faculty_id, exam_type, marks_obtained, max_marks, absent) values (st, subj, t, 'CIA1_CAT', 0, 100, true);
  perform set_config('role', 'postgres', true);
  insert into r(ok, test, info) select cia_scheme = sch, 'the course teacher sets its scheme', '' from subjects where id = subj;
  insert into r(ok, test, info) select absent and max_marks = 100, 'a mark keeps AB and its own maximum', '' from marks where subject_id = subj;
  begin
    update subjects set cia_scheme = '{"parts":[]}' where id = subj;
    insert into r(ok, test, info) values (false, 'a malformed scheme is refused', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'a malformed scheme is refused', 'refused'); end;
end $$;
select ok, test, info from r order by n;
rollback;
