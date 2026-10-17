-- Outcomes (CO / PO attainment) and the marks objection window.
-- Worked example: 10 students. CIA1_CT (/30) measures CO1, SEM_END (/100) measures CO2.
--   CO1: 7 of 10 score ≥ 60%  → 70% → level 3
--   CO2: 6 of 10 score ≥ 60%  → 60% → level 2
--   CO-PO: CO1–PO1 3, CO2–PO1 1, CO1–PO2 2
--   PO1 direct = (3×3 + 2×1) / (3+1) = 2.75 ; PO2 direct = (3×2)/2 = 3
--   feedback average 4/5 → indirect 2.4 ; final = 80% direct + 20% indirect
--   PO1 final = 2.2 + 0.48 = 2.68 ; PO2 final = 2.4 + 0.48 = 2.88
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated;

do $$
declare
  dept uuid := (select id from departments limit 1);
  hod uuid := gen_random_uuid(); tch uuid := gen_random_uuid(); oth uuid := gen_random_uuid();
  st uuid[] := array(select gen_random_uuid() from generate_series(1, 10));
  subj uuid; i int;
begin
  insert into auth.users (id, email, aud, role) select x, 'ob-' || x || '@example.test', 'authenticated', 'authenticated'
    from unnest(array[hod, tch, oth] || st) x;
  insert into profiles (id, role, department_id, full_name, email, is_active) values
    (hod, 'HOD', dept, 'O HOD', 'ohod@example.test', true),
    (tch, 'PROFESSOR', dept, 'O Teacher', 'otch@example.test', true),
    (oth, 'PROFESSOR', dept, 'O Other', 'ooth@example.test', true);
  for i in 1..10 loop
    insert into profiles (id, role, department_id, full_name, email, is_active, section, batch_year)
    values (st[i], 'STUDENT', dept, 'O Student ' || i, 'ost' || i || '@example.test', true, 'II CSE-O', 2099);
  end loop;
  insert into subjects (code, name, semester, section, term_id, audience, faculty_id, co1, co2)
    values ('OBE01', 'Outcome test', 3, 'II CSE-O', current_term_id(), 'ALL', tch, 'Explain things', 'Build things') returning id into subj;
  for i in 1..10 loop
    insert into marks (student_id, subject_id, faculty_id, exam_type, marks_obtained, max_marks) values
      (st[i], subj, tch, 'CIA1_CT', case when i <= 7 then 24 else 10 end, 30),
      (st[i], subj, tch, 'SEM_END', case when i <= 6 then 70 else 40 end, 100);
  end loop;
  insert into announcements (title, body, audience, created_by, department_id, is_urgent) values
    ('fb', '{"ratings":[4,4,4,4,4],"avgRating":4}', 'FEEDBACK:' || subj, st[1], dept, false),
    ('fb', '{"ratings":[4,4,4,4,4],"avgRating":4}', 'FEEDBACK:' || subj, st[2], dept, false);
  insert into ids values ('hod', hod), ('tch', tch), ('oth', oth), ('s1', st[1]), ('s2', st[2]), ('subj', subj);
end $$;

create or replace function pg_temp.as_user(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- the teacher maps outcomes; another faculty member cannot
do $$
declare subj uuid := (select v from ids where k = 'subj');
begin
  perform pg_temp.as_user((select v from ids where k = 'oth'));
  begin
    insert into co_po_map (subject_id, co, outcome, level) values (subj, 1, 'PO1', 3);
    insert into r(ok, test, info) values (false, 'a teacher of another course cannot edit this CO-PO matrix', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'a teacher of another course cannot edit this CO-PO matrix', 'refused'); end;
  perform set_config('role', 'postgres', true);

  perform pg_temp.as_user((select v from ids where k = 'tch'));
  insert into co_po_map (subject_id, co, outcome, level) values (subj, 1, 'PO1', 3), (subj, 2, 'PO1', 1), (subj, 1, 'PO2', 2);
  insert into assessment_co_map (subject_id, exam_type, co) values (subj, 'CIA1_CT', 1), (subj, 'SEM_END', 2);
  insert into r(ok, test, info) values (true, 'the course teacher maps COs to POs and assessments to COs', 'ok');
  begin
    insert into co_po_map (subject_id, co, outcome, level) values (subj, 3, 'PO13', 2);
    insert into r(ok, test, info) values (false, 'only PO1–PO12 and PSO1–PSO3 are accepted', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'only PO1–PO12 and PSO1–PSO3 are accepted', 'refused'); end;

  insert into r(ok, test, info) select level = 3 and pct = 70, 'CO1: 7 of 10 above target → level 3', pct || '% level ' || level from obe_co_attainment(subj) where co = 1;
  insert into r(ok, test, info) select level = 2 and pct = 60, 'CO2: 6 of 10 above target → level 2', pct || '% level ' || level from obe_co_attainment(subj) where co = 2;
  insert into r(ok, test, info) select direct = 2.75 and indirect = 2.4 and final = 2.68, 'PO1 = 80% direct 2.75 + 20% feedback 2.4 = 2.68',
    direct || ' / ' || indirect || ' / ' || final from obe_po_attainment(subj) where outcome = 'PO1';
  insert into r(ok, test, info) select final = 2.88, 'PO2 final 2.88', final::text from obe_po_attainment(subj) where outcome = 'PO2';
  insert into r(ok, test, info) select count(*) >= 2, 'the term report includes the course''s POs', count(*)::text
    from obe_program_attainment(current_term_id()) where outcome in ('PO1', 'PO2');
  perform set_config('role', 'postgres', true);
end $$;

-- students: no attainment data; objections only inside the published window
do $$
declare subj uuid := (select v from ids where k = 'subj'); n int;
begin
  perform pg_temp.as_user((select v from ids where k = 's1'));
  insert into r(ok, test, info) select count(*) = 0, 'students get no attainment figures', count(*)::text from obe_co_attainment(subj);
  begin
    insert into mark_objections (subject_id, exam_type, reason) values (subj, 'CIA1_CT', 'Question 3 not counted');
    insert into r(ok, test, info) values (false, 'no objection before the marks are published', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'no objection before the marks are published', 'refused'); end;
  begin
    perform publish_marks(subj, 'CIA1_CT');
    insert into r(ok, test, info) values (false, 'a student cannot publish marks', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'a student cannot publish marks', 'refused'); end;
  perform set_config('role', 'postgres', true);

  perform pg_temp.as_user((select v from ids where k = 'tch'));
  perform publish_marks(subj, 'CIA1_CT');
  insert into r(ok, test, info) select abs(extract(epoch from objection_until - published_at) / 86400 - 7) < 0.01,
    'publishing opens a 7-day objection window', (objection_until - published_at)::text from marks_publications where subject_id = subj;
  perform set_config('role', 'postgres', true);

  perform pg_temp.as_user((select v from ids where k = 's1'));
  insert into mark_objections (subject_id, exam_type, reason) values (subj, 'CIA1_CT', 'Question 3 not counted');
  insert into r(ok, test, info) values (true, 'student objects to a published mark inside the window', 'ok');
  begin
    insert into mark_objections (subject_id, exam_type, reason) values (subj, 'SEM_END', 'Recount please');
    insert into r(ok, test, info) values (false, 'no objection to an unpublished component', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'no objection to an unpublished component', 'refused'); end;
  perform set_config('role', 'postgres', true);

  perform pg_temp.as_user((select v from ids where k = 's2'));
  insert into r(ok, test, info) select count(*) = 0, 'a student does not see a classmate''s objection', count(*)::text from mark_objections where subject_id = subj;
  perform set_config('role', 'postgres', true);

  perform pg_temp.as_user((select v from ids where k = 'oth'));
  update mark_objections set status = 'ACCEPTED' where subject_id = subj; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 0, 'a teacher of another course cannot answer the objection', n || ' rows');
  perform set_config('role', 'postgres', true);

  perform pg_temp.as_user((select v from ids where k = 'tch'));
  update mark_objections set status = 'ACCEPTED', response = 'Recounted, +2', decided_by = (select v from ids where k = 'tch'), decided_at = now()
   where subject_id = subj; get diagnostics n = row_count;
  insert into r(ok, test, info) values (n = 1, 'the course teacher answers the objection', n || ' rows');
  perform set_config('role', 'postgres', true);

  update marks_publications set objection_until = now() - interval '1 minute' where subject_id = subj;
  perform pg_temp.as_user((select v from ids where k = 's2'));
  begin
    insert into mark_objections (subject_id, exam_type, reason) values (subj, 'CIA1_CT', 'Late objection');
    insert into r(ok, test, info) values (false, 'no objection after the window closes', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'no objection after the window closes', 'refused'); end;
  perform set_config('role', 'postgres', true);
end $$;

select ok, test, info from r order by n;
rollback;
