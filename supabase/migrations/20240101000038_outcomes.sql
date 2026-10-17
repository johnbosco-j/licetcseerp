-- Outcome-based education (NBA / NAAC 2.6.2), department data only.
--
--   co_po_map           CO × PO/PSO correlation of a course offering (1 low, 2 medium, 3 high)
--   assessment_co_map   which COs each marks component (CIA1_CT, SEM_END, …) measures
--   marks_publications  internal marks of a component released to students; opens the
--                       objection window (setting marks.objection_days, default 7)
--   mark_objections     a student's objection to a published mark, answered by the teacher / HOD
--
-- Attainment (computed, never stored):
--   CO level   share of students scoring ≥ obe.target_percent (60) in the components mapped to
--              the CO: ≥ obe.level3_percent (70) → 3, ≥ level2 (60) → 2, ≥ level1 (50) → 1, else 0
--   PO direct  Σ(CO level × correlation) / Σ correlation
--   PO final   obe.direct_weight (80) % direct + the rest indirect, where indirect is the
--              course-end feedback average (1–5) scaled to 3; direct only if no feedback yet

create table if not exists public.co_po_map (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  co         smallint not null check (co between 1 and 6),
  outcome    text not null check (outcome ~ '^(PO([1-9]|1[0-2])|PSO[1-3])$'),
  level      smallint not null check (level between 1 and 3),
  primary key (subject_id, co, outcome)
);
create table if not exists public.assessment_co_map (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  exam_type  text not null,
  co         smallint not null check (co between 1 and 6),
  primary key (subject_id, exam_type, co)
);
create table if not exists public.marks_publications (
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  exam_type       text not null,
  published_at    timestamptz not null default now(),
  published_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  objection_until timestamptz not null,
  primary key (subject_id, exam_type)
);
create table if not exists public.mark_objections (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  subject_id  uuid not null references public.subjects(id) on delete cascade,
  exam_type   text not null,
  reason      text not null check (length(trim(reason)) >= 5),
  status      text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  response    text,
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (student_id, subject_id, exam_type)
);
create index if not exists mark_objections_subject on public.mark_objections (subject_id);
create index if not exists mark_objections_decided_by on public.mark_objections (decided_by);
create index if not exists marks_publications_by on public.marks_publications (published_by);

-- the course's own teachers (not the lock-aware can_edit_subject: outcomes are planning data)
create or replace function public.teaches_subject(p_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subjects s where s.id = p_subject and s.faculty_id = auth.uid())
      or exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = auth.uid())
$$;

alter table public.co_po_map enable row level security;
alter table public.assessment_co_map enable row level security;
alter table public.marks_publications enable row level security;
alter table public.mark_objections enable row level security;

drop policy if exists copo_read on public.co_po_map;
create policy copo_read on public.co_po_map for select to authenticated using (is_staff());
drop policy if exists copo_ins on public.co_po_map;
create policy copo_ins on public.co_po_map for insert to authenticated with check (is_hod() or teaches_subject(subject_id));
drop policy if exists copo_upd on public.co_po_map;
create policy copo_upd on public.co_po_map for update to authenticated using (is_hod() or teaches_subject(subject_id)) with check (is_hod() or teaches_subject(subject_id));
drop policy if exists copo_del on public.co_po_map;
create policy copo_del on public.co_po_map for delete to authenticated using (is_hod() or teaches_subject(subject_id));

drop policy if exists aco_read on public.assessment_co_map;
create policy aco_read on public.assessment_co_map for select to authenticated using (is_staff());
drop policy if exists aco_ins on public.assessment_co_map;
create policy aco_ins on public.assessment_co_map for insert to authenticated with check (is_hod() or teaches_subject(subject_id));
drop policy if exists aco_upd on public.assessment_co_map;
create policy aco_upd on public.assessment_co_map for update to authenticated using (is_hod() or teaches_subject(subject_id)) with check (is_hod() or teaches_subject(subject_id));
drop policy if exists aco_del on public.assessment_co_map;
create policy aco_del on public.assessment_co_map for delete to authenticated using (is_hod() or teaches_subject(subject_id));

-- students see which of their marks are published (and until when they can object)
drop policy if exists pub_read on public.marks_publications;
create policy pub_read on public.marks_publications for select to authenticated using (true);
drop policy if exists pub_ins on public.marks_publications;
create policy pub_ins on public.marks_publications for insert to authenticated with check (is_hod() or teaches_subject(subject_id));
drop policy if exists pub_upd on public.marks_publications;
create policy pub_upd on public.marks_publications for update to authenticated using (is_hod() or teaches_subject(subject_id)) with check (is_hod() or teaches_subject(subject_id));
drop policy if exists pub_del on public.marks_publications;
create policy pub_del on public.marks_publications for delete to authenticated using (is_hod());

drop policy if exists obj_read on public.mark_objections;
create policy obj_read on public.mark_objections for select to authenticated
  using (student_id = (select auth.uid()) or is_hod() or teaches_subject(subject_id));
-- a student objects to their own published mark, inside the window only
drop policy if exists obj_ins on public.mark_objections;
create policy obj_ins on public.mark_objections for insert to authenticated with check (
  student_id = (select auth.uid()) and status = 'PENDING' and decided_by is null and response is null
  and exists (select 1 from marks_publications p where p.subject_id = mark_objections.subject_id
                and p.exam_type = mark_objections.exam_type and now() <= p.objection_until)
  and exists (select 1 from marks m where m.student_id = (select auth.uid())
                and m.subject_id = mark_objections.subject_id and m.exam_type = mark_objections.exam_type));
drop policy if exists obj_upd on public.mark_objections;
create policy obj_upd on public.mark_objections for update to authenticated
  using (is_hod() or teaches_subject(subject_id)) with check (is_hod() or teaches_subject(subject_id));
drop policy if exists obj_del on public.mark_objections;
create policy obj_del on public.mark_objections for delete to authenticated
  using (is_hod() or (student_id = (select auth.uid()) and status = 'PENDING'));

insert into public.app_settings (key, value) values
  ('obe.target_percent', '60'), ('obe.level3_percent', '70'), ('obe.level2_percent', '60'),
  ('obe.level1_percent', '50'), ('obe.direct_weight', '80'), ('marks.objection_days', '7')
on conflict (key) do nothing;

-- publish a component's marks to students: opens the objection window
create or replace function public.publish_marks(p_subject uuid, p_exam_type text)
returns public.marks_publications language plpgsql security definer set search_path = public as $$
declare r marks_publications;
begin
  if not (is_hod() or teaches_subject(p_subject)) then raise exception 'Only the course teacher or the HOD can publish marks'; end if;
  if not exists (select 1 from marks where subject_id = p_subject and exam_type = p_exam_type) then
    raise exception 'No marks entered for this component yet';
  end if;
  insert into marks_publications (subject_id, exam_type, objection_until)
  values (p_subject, p_exam_type, now() + make_interval(days => setting_int('marks.objection_days', 7)))
  on conflict (subject_id, exam_type) do update set published_at = now(), published_by = auth.uid(),
    objection_until = now() + make_interval(days => setting_int('marks.objection_days', 7))
  returning * into r;
  return r;
end $$;

-- the course's teachers write its CO statements (the rest of the course row stays HOD-only)
create or replace function public.set_course_outcomes(p_subject uuid, p_cos text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_hod() or teaches_subject(p_subject)) then raise exception 'Only the course teacher or the HOD can edit course outcomes'; end if;
  update subjects set co1 = nullif(trim(p_cos[1]), ''), co2 = nullif(trim(p_cos[2]), ''), co3 = nullif(trim(p_cos[3]), ''),
                      co4 = nullif(trim(p_cos[4]), ''), co5 = nullif(trim(p_cos[5]), ''), co6 = nullif(trim(p_cos[6]), '')
   where id = p_subject;
end $$;

create or replace function public.obe_co_attainment(p_subject uuid)
returns table (co int, statement text, components text, students int, above_target int, pct numeric, level int)
language sql stable security definer set search_path = public as $$
  with s as (select * from subjects where id = p_subject),
  cos as (
    select n as co, case n when 1 then s.co1 when 2 then s.co2 when 3 then s.co3 when 4 then s.co4 when 5 then s.co5 else s.co6 end as statement
    from s, generate_series(1, 6) n
  ),
  per_student as (
    select a.co, m.student_id, 100.0 * sum(m.marks_obtained) / nullif(sum(m.max_marks), 0) as score
    from assessment_co_map a join marks m on m.subject_id = a.subject_id and m.exam_type = a.exam_type
    where a.subject_id = p_subject
    group by a.co, m.student_id
  ),
  agg as (
    select co, count(*)::int as n, count(*) filter (where score >= setting_int('obe.target_percent', 60))::int as above
    from per_student group by co
  )
  select c.co, c.statement,
         (select string_agg(exam_type, ', ' order by exam_type) from assessment_co_map a where a.subject_id = p_subject and a.co = c.co),
         coalesce(g.n, 0), coalesce(g.above, 0),
         round(100.0 * g.above / nullif(g.n, 0), 1),
         case when g.n is null or g.n = 0 then null
              when 100.0 * g.above / g.n >= setting_int('obe.level3_percent', 70) then 3
              when 100.0 * g.above / g.n >= setting_int('obe.level2_percent', 60) then 2
              when 100.0 * g.above / g.n >= setting_int('obe.level1_percent', 50) then 1 else 0 end
  from cos c left join agg g on g.co = c.co
  where is_staff() and (c.statement is not null or g.n is not null
                        or exists (select 1 from co_po_map x where x.subject_id = p_subject and x.co = c.co))
  order by c.co
$$;

create or replace function public.obe_po_attainment(p_subject uuid)
returns table (outcome text, direct numeric, indirect numeric, final numeric, feedback_responses int)
language sql stable security definer set search_path = public as $$
  with col as (select co, level from obe_co_attainment(p_subject) where level is not null),
  fb as (
    select count(*)::int as n, avg((body::jsonb ->> 'avgRating')::numeric) as avg_rating
    from announcements where audience = 'FEEDBACK:' || p_subject and body ~ '^\s*\{'
  ),
  direct as (
    select m.outcome, round(sum(c.level * m.level)::numeric / nullif(sum(m.level), 0), 2) as d
    from co_po_map m join col c on c.co = m.co
    where m.subject_id = p_subject
    group by m.outcome
  )
  select m.outcome, d.d,
         case when fb.n > 0 then round(fb.avg_rating / 5 * 3, 2) end,
         case when d.d is null then null
              when fb.n > 0 then round((setting_int('obe.direct_weight', 80) * d.d + (100 - setting_int('obe.direct_weight', 80)) * (fb.avg_rating / 5 * 3)) / 100, 2)
              else d.d end,
         fb.n
  from (select distinct outcome from co_po_map where subject_id = p_subject) m
  left join direct d on d.outcome = m.outcome
  cross join fb
  where is_staff()
  order by length(m.outcome), m.outcome
$$;

-- department-level attainment of every PO / PSO for a term (NAAC 2.6.2, NBA criterion 3)
create or replace function public.obe_program_attainment(p_term uuid)
returns table (outcome text, courses int, attainment numeric, lowest numeric, highest numeric)
language sql stable security definer set search_path = public as $$
  select p.outcome, count(*)::int, round(avg(p.final), 2), min(p.final), max(p.final)
  from subjects s cross join lateral obe_po_attainment(s.id) p
  where is_staff() and s.term_id = p_term and p.final is not null
  group by p.outcome
  order by length(p.outcome), p.outcome
$$;

revoke execute on function public.teaches_subject(uuid), public.publish_marks(uuid, text), public.set_course_outcomes(uuid, text[]), public.obe_co_attainment(uuid),
  public.obe_po_attainment(uuid), public.obe_program_attainment(uuid) from public, anon;
grant execute on function public.teaches_subject(uuid), public.publish_marks(uuid, text), public.set_course_outcomes(uuid, text[]), public.obe_co_attainment(uuid),
  public.obe_po_attainment(uuid), public.obe_program_attainment(uuid) to authenticated;

-- audit trail for the new records (same trigger as the other audited tables)
drop trigger if exists audit_co_po_map on public.co_po_map;
create trigger audit_co_po_map after insert or update or delete on public.co_po_map for each row execute function public.audit_row();
drop trigger if exists audit_marks_publications on public.marks_publications;
create trigger audit_marks_publications after insert or update or delete on public.marks_publications for each row execute function public.audit_row();
drop trigger if exists audit_mark_objections on public.mark_objections;
create trigger audit_mark_objections after insert or update or delete on public.mark_objections for each row execute function public.audit_row();
