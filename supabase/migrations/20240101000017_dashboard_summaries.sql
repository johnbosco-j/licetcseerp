-- Aggregates for the dashboard, computed in the database so the browser never
-- downloads every attendance row. SECURITY INVOKER: the caller's RLS applies
-- (staff see every student, a student sees only their own records).

-- Session-wise attendance per student since p_from (start of the semester),
-- grouped by the student's current section.
create or replace function public.student_attendance_summary(p_from date, p_section text default null)
returns table (student_id uuid, full_name text, section text, sessions bigint, present bigint, pct numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.full_name, p.section,
         count(d.id),
         count(d.id) filter (where d.status in ('PRESENT', 'LATE')),
         round(100.0 * count(d.id) filter (where d.status in ('PRESENT', 'LATE')) / nullif(count(d.id), 0), 1)
  from profiles p
  join day_attendance d on d.student_id = p.id and d.date >= p_from
  where p.role = 'STUDENT' and p.is_active
    and (p_section is null or p.section = p_section)
  group by p.id, p.full_name, p.section
$$;

-- Per-section roll-up: semester attendance, eligibility bands (Regulations 2024
-- clause 7: >= 75% eligible, 65-74% condonation, < 65% SA) and today's marking.
create or replace function public.section_attendance_summary(p_from date, p_today date default current_date)
returns table (
  section text, sessions bigint, present bigint, students_tracked bigint,
  below_75 bigint, below_65 bigint,
  today_sessions bigint, today_present bigint, today_parts int[]
)
language sql stable security invoker set search_path = public as $$
  with per_student as (
    select * from public.student_attendance_summary(p_from)
  ), today as (
    select p.section,
           count(d.id) as n,
           count(d.id) filter (where d.status in ('PRESENT', 'LATE')) as p,
           array_agg(distinct d.part order by d.part) as parts
    from day_attendance d join profiles p on p.id = d.student_id
    where d.date = p_today
    group by p.section
  ), sem as (
    select s.section, sum(s.sessions) as sessions, sum(s.present) as present, count(*) as tracked,
           count(*) filter (where s.pct < 75) as b75, count(*) filter (where s.pct < 65) as b65
    from per_student s group by s.section
  )
  select coalesce(sem.section, today.section),
         coalesce(sem.sessions, 0), coalesce(sem.present, 0), coalesce(sem.tracked, 0),
         coalesce(sem.b75, 0), coalesce(sem.b65, 0),
         coalesce(today.n, 0), coalesce(today.p, 0), coalesce(today.parts, '{}')
  from sem full join today on today.section = sem.section
$$;

grant execute on function public.student_attendance_summary(date, text) to authenticated;
grant execute on function public.section_attendance_summary(date, date) to authenticated;
revoke execute on function public.student_attendance_summary(date, text) from public, anon;
revoke execute on function public.section_attendance_summary(date, date) from public, anon;
