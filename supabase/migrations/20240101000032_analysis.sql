-- Phase 4 — analysis for the HOD (and staff). Every function is read-only, runs
-- in the database, and returns nothing to students. Weekly figures use the
-- hour-wise register; "scheduled" hours come from the timetable × calendar.

-- Hours each class was *scheduled* to have (timetable entries that take attendance,
-- on working days of that class's calendar scope, following the day order).
create or replace function public.ana_scheduled(p_term uuid, p_from date default null, p_to date default null)
returns table (date date, period_no smallint, section text, subject_id uuid, label text, audience text,
               audience_value text, group_id uuid, entry_id uuid, faculty_ids uuid[], faculty_names text)
language sql stable security definer set search_path = public as $$
  select c.date, e.period_no, e.section, e.subject_id, e.label, e.audience, e.audience_value, e.group_id, e.id, e.faculty_ids, e.faculty_names
  from timetable_entries e
  join calendar_days c on c.term_id = e.term_id and c.is_working and c.day_order = e.day_order
   and c.scope = case split_part(e.section, ' ', 1) when 'I' then 'FY' when 'IV' then 'IV' else 'HS' end
  where is_staff() and e.term_id = p_term and e.takes_attendance
    and (e.effective_from is null or c.date >= e.effective_from) and (e.effective_to is null or c.date <= e.effective_to)
    and c.date between coalesce(p_from, '-infinity'::date) and least(coalesce(p_to, 'infinity'::date), ist_today())
$$;

-- Scheduled hours with no attendance recorded (a cohort class counts once for both sections).
create or replace function public.ana_missing_hours(p_term uuid, p_from date default null, p_to date default null)
returns table (date date, period_no smallint, section text, course text, audience text, audience_value text, faculty_names text, faculty_ids uuid[])
language sql stable security definer set search_path = public as $$
  select distinct on (x.date, x.period_no, coalesce(sb.section, x.section), coalesce(x.subject_id::text, x.label), x.audience, coalesce(x.audience_value, ''))
         x.date, x.period_no, case when sb.id is not null and sb.section is null then 'Combined' else x.section end,
         coalesce(sb.short_name, sb.code, x.label), x.audience, x.audience_value, x.faculty_names, x.faculty_ids
  from ana_scheduled(p_term, p_from, p_to) x
  left join subjects sb on sb.id = x.subject_id
  -- "recorded" = attendance exists for the same class, hour and batch/vertical, whatever
  -- course it was entered under (substitutions and later timetable edits don't count as gaps)
  where not exists (
    select 1 from attendance_sessions s
    where s.date = x.date and s.period_no = x.period_no
      and (s.section = x.section or (s.section is null and sb.id is not null and sb.section is null and s.cohort_grad_year = sb.cohort_grad_year))
      and (s.audience = 'ALL' or (s.audience = x.audience and coalesce(s.audience_value, '') = coalesce(x.audience_value, '')
                                   and coalesce(s.group_id::text, '') = coalesce(x.group_id::text, ''))))
  order by x.date, x.period_no, coalesce(sb.section, x.section), coalesce(x.subject_id::text, x.label), x.audience, coalesce(x.audience_value, '')
$$;

-- Section KPIs for a term.
create or replace function public.ana_section_kpis(p_term uuid)
returns table (section text, students bigint, hours bigint, attended bigint, pct numeric, below_75 bigint, below_65 bigint,
               od_hours bigint, last7_pct numeric, sessions bigint)
language sql stable security definer set search_path = public as $$
  with own as (   -- the class = students on its own (non-combined) hours this term
    select distinct s.section, r.sid from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.term_id = p_term and s.section is not null
  ), hrs as (
    select o.section, r.sid, s.date, (r.sid = any(s.absent)) ab, (r.sid = any(s.on_duty)) od
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    join own o on o.sid = r.sid
    where s.term_id = p_term and (s.section = o.section or s.section is null)
  ), per as (
    select section, sid, count(*) h, count(*) filter (where not ab) a, count(*) filter (where od) od,
           count(*) filter (where date > ist_today() - 7) h7, count(*) filter (where date > ist_today() - 7 and not ab) a7
    from hrs group by section, sid
  )
  select p.section, count(*), sum(h), sum(a), round(100.0 * sum(a) / nullif(sum(h), 0), 1),
         count(*) filter (where round(100.0 * a / nullif(h, 0)) < 75), count(*) filter (where round(100.0 * a / nullif(h, 0)) < 65),
         sum(od), round(100.0 * sum(a7) / nullif(sum(h7), 0), 1),
         (select count(*) from attendance_sessions s where s.term_id = p_term and s.section = p.section)
  from per p where is_staff() group by p.section order by p.section
$$;

-- Course × section attendance (heat map).
create or replace function public.ana_course_matrix(p_term uuid)
returns table (section text, subject_id uuid, course text, hours bigint, pct numeric)
language sql stable security definer set search_path = public as $$
  select coalesce(s.section, 'Combined'), s.subject_id, coalesce(sb.short_name, sb.code, s.label),
         count(distinct s.id), round(100.0 * sum(cardinality(s.roster) - cardinality(s.absent)) / nullif(sum(cardinality(s.roster)), 0), 1)
  from attendance_sessions s left join subjects sb on sb.id = s.subject_id
  where is_staff() and s.term_id = p_term
  group by 1, 2, 3 order by 1, 3
$$;

-- When are students absent? Absence rate by weekday × period for a class.
create or replace function public.ana_patterns(p_term uuid, p_section text default null)
returns table (weekday int, period_no smallint, marks bigint, absences bigint, absent_pct numeric)
language sql stable security definer set search_path = public as $$
  select extract(isodow from s.date)::int, s.period_no, sum(cardinality(s.roster)), sum(cardinality(s.absent)),
         round(100.0 * sum(cardinality(s.absent)) / nullif(sum(cardinality(s.roster)), 0), 1)
  from attendance_sessions s
  where is_staff() and s.term_id = p_term and (p_section is null or s.section = p_section)
  group by 1, 2 order by 1, 2
$$;

-- Weekly attendance % per class (trend lines).
create or replace function public.ana_weekly_trend(p_term uuid)
returns table (week date, section text, pct numeric)
language sql stable security definer set search_path = public as $$
  select date_trunc('week', s.date)::date, s.section,
         round(100.0 * sum(cardinality(s.roster) - cardinality(s.absent)) / nullif(sum(cardinality(s.roster)), 0), 1)
  from attendance_sessions s
  where is_staff() and s.term_id = p_term and s.section is not null
  group by 1, 2 order by 1, 2
$$;

-- Students absent for every recorded hour on N or more consecutive class days.
create or replace function public.ana_absence_streaks(p_term uuid, p_min_days int default 3)
returns table (student_id uuid, full_name text, register_number text, section text, from_date date, to_date date, days int)
language sql stable security definer set search_path = public as $$
  with d as (
    select r.sid, s.date, bool_and(r.sid = any(s.absent)) all_absent
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.term_id = p_term group by r.sid, s.date
  ), g as (
    select sid, date, all_absent,
           row_number() over (partition by sid order by date) - row_number() over (partition by sid, all_absent order by date) grp
    from d
  ), runs as (
    select sid, min(date) f, max(date) t, count(*)::int n from g where all_absent group by sid, grp
  )
  select p.id, p.full_name, p.register_number, p.section, r.f, r.t, r.n
  from runs r join profiles p on p.id = r.sid
  where is_staff() and r.n >= p_min_days order by r.n desc, r.t desc
$$;

-- Fell below the minimum in the last two weeks (were at/above it 14 days ago).
create or replace function public.ana_new_defaulters(p_term uuid, p_min numeric default 75)
returns table (student_id uuid, full_name text, register_number text, section text, pct_then numeric, pct_now numeric)
language sql stable security definer set search_path = public as $$
  with h as (
    select r.sid, count(*) n, count(*) filter (where not (r.sid = any(s.absent))) a,
           count(*) filter (where s.date <= ist_today() - 14) n0,
           count(*) filter (where s.date <= ist_today() - 14 and not (r.sid = any(s.absent))) a0
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.term_id = p_term group by r.sid
  )
  select p.id, p.full_name, p.register_number, p.section, round(100.0 * a0 / nullif(n0, 0), 1), round(100.0 * a / nullif(n, 0), 1)
  from h join profiles p on p.id = h.sid
  where is_staff() and n0 > 0 and round(100.0 * a0 / n0) >= p_min and round(100.0 * a / nullif(n, 0)) < p_min
  order by 6
$$;

-- Faculty: hours scheduled on the timetable vs hours they actually recorded.
create or replace function public.ana_faculty_load(p_term uuid, p_from date default null, p_to date default null)
returns table (faculty_id uuid, full_name text, scheduled bigint, recorded bigint, missing bigint, with_topic bigint, self_checkins bigint)
language sql stable security definer set search_path = public as $$
  with sch as (
    select f.fid, count(*) n from ana_scheduled(p_term, p_from, p_to) x cross join lateral unnest(x.faculty_ids) f(fid) group by f.fid
  ), rec as (
    select s.taken_by fid, count(*) n, count(*) filter (where coalesce(s.topic, '') <> '') t, count(*) filter (where s.mode = 'SELF') sc
    from attendance_sessions s
    where s.term_id = p_term and s.mode <> 'IMPORT'
      and s.date between coalesce(p_from, '-infinity'::date) and coalesce(p_to, 'infinity'::date)
    group by s.taken_by
  ), miss as (
    select f.fid, count(*) n from ana_missing_hours(p_term, p_from, p_to) m cross join lateral unnest(m.faculty_ids) f(fid) group by f.fid
  )
  select p.id, p.full_name, coalesce(sch.n, 0), coalesce(rec.n, 0), coalesce(miss.n, 0), coalesce(rec.t, 0), coalesce(rec.sc, 0)
  from profiles p left join sch on sch.fid = p.id left join rec on rec.fid = p.id left join miss on miss.fid = p.id
  where is_staff() and p.role <> 'STUDENT' and p.is_active and (sch.n is not null or rec.n is not null)
  order by coalesce(miss.n, 0) desc, p.full_name
$$;

-- Batches and verticals compared within each class.
create or replace function public.ana_groups(p_term uuid)
returns table (section text, group_kind text, value text, students bigint, pct numeric)
language sql stable security definer set search_path = public as $$
  with h as (
    select r.sid, count(*) n, count(*) filter (where not (r.sid = any(s.absent))) a
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.term_id = p_term group by r.sid
  )
  select p.section, g.k, g.v, count(*), round(100.0 * sum(h.a) / nullif(sum(h.n), 0), 1)
  from h join profiles p on p.id = h.sid
  cross join lateral (values ('Lab batch', p.lab_batch::text), ('Vertical', p.vertical)) g(k, v)
  where is_staff() and g.v is not null
  group by 1, 2, 3 order by 1, 2, 3
$$;

-- The same batch across terms (e.g. 2024-28 in 2025-26 Even vs 2026-27 Odd).
create or replace function public.ana_cohort_terms()
returns table (cohort_grad_year int, term_label text, starts_on date, pct numeric, hours bigint)
language sql stable security definer set search_path = public as $$
  select s.cohort_grad_year, t.label, t.starts_on,
         round(100.0 * sum(cardinality(s.roster) - cardinality(s.absent)) / nullif(sum(cardinality(s.roster)), 0), 1), count(*)
  from attendance_sessions s join academic_terms t on t.id = s.term_id
  where is_staff() and s.cohort_grad_year is not null
  group by 1, 2, 3 order by 1, 3
$$;

-- Flexible report: hours/attended/% grouped by student, course, date, section, weekday or faculty.
create or replace function public.ana_custom(p_term uuid, p_sections text[] default null, p_subjects uuid[] default null,
                                             p_from date default null, p_to date default null, p_group text default 'student')
returns table (key text, label text, hours bigint, attended bigint, pct numeric)
language sql stable security definer set search_path = public as $$
  with h as (
    select r.sid, s.*, not (r.sid = any(s.absent)) pres
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.term_id = p_term
      and (p_subjects is null or s.subject_id = any(p_subjects))
      and s.date between coalesce(p_from, '-infinity'::date) and coalesce(p_to, 'infinity'::date)
  ), j as (
    select h.*, p.full_name, p.register_number, p.section stu_section from h join profiles p on p.id = h.sid
    where p_sections is null or p.section = any(p_sections)
  )
  select case p_group when 'student' then sid::text when 'course' then coalesce(subject_id::text, label)
                      when 'date' then date::text when 'section' then stu_section when 'weekday' then extract(isodow from date)::text
                      when 'faculty' then coalesce(taken_by::text, '-') else sid::text end,
         case p_group when 'student' then max(coalesce(register_number, '') || ' ' || full_name)
                      when 'course' then max(coalesce((select coalesce(short_name, code) from subjects x where x.id = j.subject_id), label))
                      when 'date' then max(to_char(date, 'Dy DD Mon'))
                      when 'section' then max(stu_section)
                      when 'weekday' then max(to_char(date, 'Day'))
                      when 'faculty' then max(coalesce((select full_name from profiles x where x.id = j.taken_by), 'Imported register'))
                      else max(full_name) end,
         count(*), count(*) filter (where pres), round(100.0 * count(*) filter (where pres) / nullif(count(*), 0), 1)
  from j where is_staff()
  group by 1 order by 5 nulls last, 2
$$;

do $$
declare f text;
begin
  foreach f in array array['ana_scheduled(uuid,date,date)', 'ana_missing_hours(uuid,date,date)', 'ana_section_kpis(uuid)',
    'ana_course_matrix(uuid)', 'ana_patterns(uuid,text)', 'ana_weekly_trend(uuid)', 'ana_absence_streaks(uuid,integer)',
    'ana_new_defaulters(uuid,numeric)', 'ana_faculty_load(uuid,date,date)', 'ana_groups(uuid)', 'ana_cohort_terms()',
    'ana_custom(uuid,text[],uuid[],date,date,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
