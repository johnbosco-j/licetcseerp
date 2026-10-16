-- Dashboards, risk scores and reports read attendance through these functions.
-- They now count class hours from attendance_sessions (Regulation 7.1: hours
-- attended in all courses ÷ hours conducted) instead of the old day parts.
-- Staff see everyone; a student sees only their own row.

create or replace function public.student_attendance_summary(p_from date, p_section text default null)
returns table (student_id uuid, full_name text, section text, sessions bigint, present bigint, pct numeric)
language sql stable security definer set search_path = public as $$
  with hours as (
    select r.sid, (r.sid = any(s.absent)) as absent
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.date >= coalesce(p_from, (select starts_on from academic_terms where is_current), current_date - 180)
      and (is_staff() or r.sid = auth.uid())
  )
  select p.id, p.full_name, p.section, count(*), count(*) filter (where not h.absent),
         round(100.0 * count(*) filter (where not h.absent) / nullif(count(*), 0), 1)
  from hours h join profiles p on p.id = h.sid
  where p.role = 'STUDENT' and p.is_active and (p_section is null or p.section = p_section)
  group by p.id, p.full_name, p.section
$$;

create or replace function public.section_attendance_summary(p_from date, p_today date default current_date)
returns table (section text, sessions bigint, present bigint, students_tracked bigint, below_75 bigint, below_65 bigint,
               today_sessions bigint, today_present bigint, today_parts integer[])
language sql stable security definer set search_path = public as $$
  with per_student as (
    select * from public.student_attendance_summary(p_from)
  ), today as (
    select p.section, count(*) as n, count(*) filter (where not (r.sid = any(s.absent))) as pr,
           array_agg(distinct s.period_no::int order by s.period_no::int) as parts
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    join profiles p on p.id = r.sid
    where s.date = p_today and is_staff()
    group by p.section
  ), sem as (
    select s.section, sum(s.sessions) as sessions, sum(s.present) as present, count(*) as tracked,
           count(*) filter (where s.pct < 75) as b75, count(*) filter (where s.pct < 65) as b65
    from per_student s group by s.section
  )
  select coalesce(sem.section, today.section),
         coalesce(sem.sessions, 0), coalesce(sem.present, 0), coalesce(sem.tracked, 0),
         coalesce(sem.b75, 0), coalesce(sem.b65, 0),
         coalesce(today.n, 0), coalesce(today.pr, 0), coalesce(today.parts, '{}')
  from sem full join today on today.section = sem.section
$$;

-- Totals for a list of students (risk scores, student 360, analytics).
create or replace function public.att_student_totals(p_ids uuid[], p_from date default null)
returns table (student_id uuid, hours bigint, present bigint)
language sql stable security definer set search_path = public as $$
  select r.sid, count(*), count(*) filter (where not (r.sid = any(s.absent)))
  from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
  where r.sid = any(p_ids)
    and (is_staff() or r.sid = auth.uid())
    and s.date >= coalesce(p_from, (select starts_on from academic_terms where is_current), current_date - 180)
  group by r.sid
$$;

create or replace function public.att_department_totals(p_from date default null)
returns table (hours bigint, present bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(cardinality(roster)), 0)::bigint, coalesce(sum(cardinality(roster) - cardinality(absent)), 0)::bigint
  from attendance_sessions
  where is_staff() and date >= coalesce(p_from, (select starts_on from academic_terms where is_current), current_date - 180)
$$;

-- Per-course hours for one student in a term (student page, student 360).
create or replace function public.att_student_courses(p_student uuid, p_term uuid default null)
returns table (subject_id uuid, label text, hours bigint, present bigint)
language sql stable security definer set search_path = public as $$
  select s.subject_id, s.label, count(*), count(*) filter (where not (p_student = any(s.absent)))
  from attendance_sessions s
  where p_student = any(s.roster) and s.term_id = coalesce(p_term, current_term_id())
    and (is_staff() or p_student = auth.uid())
  group by s.subject_id, s.label
$$;

revoke all on function public.student_attendance_summary(date, text), public.section_attendance_summary(date, date),
  public.att_student_totals(uuid[], date), public.att_department_totals(date), public.att_student_courses(uuid, uuid) from public, anon;
grant execute on function public.student_attendance_summary(date, text), public.section_attendance_summary(date, date),
  public.att_student_totals(uuid[], date), public.att_department_totals(date), public.att_student_courses(uuid, uuid) to authenticated;
