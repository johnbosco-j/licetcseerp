-- New staff accounts pick up waiting advisor posts and their printed courses.
begin;
create temp table r (n serial, ok boolean, test text, info text);
do $$
declare
  dept uuid := (select id from departments limit 1);
  t uuid := current_term_id();
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); st uuid := gen_random_uuid();
  c1 uuid; c2 uuid; c3 uuid;
  sec text := 'IV CSE-B';
begin
  update profiles set advisor_section = null where advisor_section = sec;
  insert into pending_staff_links (name_key, advisor_section) values ('zyxtest qwerty', sec), ('plonkat wibber', sec);
  insert into subjects (code, name, semester, section, term_id, audience, faculty_names)
    values ('ZZ90001', 'Test course one', 7, sec, t, 'ALL', 'Ms Zyxtest Qwerty, AP/CSE') returning id into c1;
  insert into subjects (code, name, semester, section, term_id, audience, faculty_names)
    values ('ZZ90002', 'Test course two', 7, sec, t, 'ALL', 'Mr Someone Else, AP/Mech') returning id into c2;
  insert into subjects (code, name, semester, section, term_id, audience, faculty_names)
    values ('ZZ90003', 'Test course three', 7, sec, t, 'ALL', 'Ms Zyxtest Qwerty / Mr Plonkat Wibber') returning id into c3;

  insert into auth.users (id, email, aud, role) values
    (a, 'zq@example.test', 'authenticated', 'authenticated'), (b, 'pw@example.test', 'authenticated', 'authenticated'), (st, 'st@example.test', 'authenticated', 'authenticated');
  insert into profiles (id, role, department_id, full_name, email, is_active, section)
    values (st, 'STUDENT', dept, 'Zyxtest Qwerty', 'st@example.test', true, sec);
  insert into r(ok, test, info) values ((select advisor_section from profiles where id = st) is null, 'a student with the same name is not linked', 'ok');

  insert into profiles (id, role, department_id, full_name, email, is_active) values (a, 'PROFESSOR', dept, 'Dr. Zyxtest Qwerty L', 'zq@example.test', true);
  insert into r(ok, test, info) values ((select advisor_section from profiles where id = a) = sec, 'new staff account takes the waiting advisor post', coalesce((select advisor_section from profiles where id = a), 'none'));
  insert into r(ok, test, info) values ((select linked_to from pending_staff_links where name_key = 'zyxtest qwerty') = a, 'waiting post is marked as linked', 'ok');
  insert into r(ok, test, info) values ((select faculty_id from subjects where id = c1) = a, 'course printed with their name gets them as instructor', 'ok');
  insert into r(ok, test, info) values ((select faculty_id from subjects where id = c2) is null, 'course printed with another name stays unlinked', 'ok');
  insert into r(ok, test, info) values (exists (select 1 from subject_faculty where subject_id = c3 and faculty_id = a), 'shared course links the first teacher', 'ok');

  insert into profiles (id, role, department_id, full_name, email, is_active) values (b, 'PROFESSOR', dept, 'Plonkat Wibber', 'pw@example.test', true);
  insert into r(ok, test, info) values ((select advisor_section from profiles where id = b) is null, 'a section that already has an advisor is not given a second one', coalesce((select advisor_section from profiles where id = b), 'none'));
  insert into r(ok, test, info) values (not exists (select 1 from subject_faculty where subject_id = c3 and faculty_id = b), 'a course already linked to someone is left alone', 'ok');
end $$;
select ok, test, info from r order by n;
rollback;
