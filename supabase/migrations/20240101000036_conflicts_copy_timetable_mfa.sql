-- Plan gaps closed together:
--   1. att_save refuses to overwrite a newer edit made by someone else (conflict check).
--   2. copy_timetable: the "Start next term" wizard copies a previous term's timetable.
--   3. Analysis: topic-coverage log and self check-in / head-count report.
--   4. HOD two-factor sign-in: once the HOD (or a tier-1 member) has a verified
--      authenticator, their HOD powers need a session signed in with it (aal2).
--   5. Small things: an FK index, the optional projector-code setting.

-- ── 1. save with a conflict check ──────────────────────────────────────────
drop function if exists public.att_save(uuid, uuid[], text, boolean, text, int, uuid[]);
create or replace function public.att_save(p_session uuid, p_absent uuid[], p_topic text, p_submit boolean,
                                           p_reason text default null, p_headcount int default null,
                                           p_on_duty uuid[] default null, p_expected timestamptz default null)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions; lockmin int := setting_int('attendance.lock_minutes', 10); present int; who text;
begin
  if not is_staff() then raise exception 'Only staff can mark attendance'; end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.id is null then raise exception 'Attendance hour not found'; end if;
  if not att_can_take(s.subject_id, s.section, s.entry_id, s.date) then
    raise exception 'Only the course instructor, class advisor, a delegated colleague or the HOD can mark this hour';
  end if;
  -- someone else saved this hour after the caller opened it: do not overwrite their marks
  if p_expected is not null and s.updated_at > p_expected and s.updated_by is distinct from auth.uid() then
    select full_name into who from profiles where id = s.updated_by;
    raise exception 'This hour was changed by % at % after you opened it. Close and open it again to see the latest marks.',
      coalesce(who, 'someone else'), to_char(s.updated_at at time zone 'Asia/Kolkata', 'HH12:MI AM')
      using errcode = '40001';
  end if;
  present := cardinality(s.roster) - cardinality(array(select unnest(coalesce(p_absent, '{}')) intersect select unnest(s.roster)));
  if p_submit and s.mode = 'SELF' and setting_text('attendance.require_headcount', 'true') = 'true'
     and coalesce(p_headcount, s.headcount) is null then
    raise exception 'Enter the head count of students in the room before submitting a self check-in';
  end if;
  -- OD students are away on duty, so they are not part of the head count
  if p_submit and coalesce(p_headcount, s.headcount) is not null
     and present - cardinality(coalesce(p_on_duty, s.on_duty)) > coalesce(p_headcount, s.headcount) then
    raise exception '% marked present but only % counted in the room — mark the extra students absent first',
      present - cardinality(coalesce(p_on_duty, s.on_duty)), coalesce(p_headcount, s.headcount);
  end if;
  update attendance_sessions set
    absent       = coalesce(p_absent, '{}'),
    on_duty      = coalesce(p_on_duty, on_duty),
    topic        = coalesce(p_topic, topic),
    edit_reason  = coalesce(p_reason, edit_reason),
    headcount    = coalesce(p_headcount, headcount),
    taken_by     = coalesce(taken_by, auth.uid()),
    status       = case when p_submit then 'SUBMITTED' else status end,
    submitted_at = case when p_submit and submitted_at is null then now() else submitted_at end,
    lock_at      = case when p_submit and submitted_at is null then now() + make_interval(mins => lockmin) else lock_at end,
    self_open_until = case when p_submit then null else self_open_until end
  where id = p_session
  returning * into s;
  return s;
end $$;
revoke execute on function public.att_save(uuid, uuid[], text, boolean, text, int, uuid[], timestamptz) from public, anon;
grant execute on function public.att_save(uuid, uuid[], text, boolean, text, int, uuid[], timestamptz) to authenticated;

-- ── 2. copy a timetable into a new term ────────────────────────────────────
-- Courses are matched by code: a section course to the same code in the same section,
-- a combined course to the same code for the batch that is in that year now. Only
-- classes that have no timetable yet in the target term are filled, so it never
-- overwrites work. Hours whose course has no offering in the target term are skipped.
create or replace function public.copy_timetable(p_from uuid, p_to uuid, p_sections text[] default null)
returns table (section text, copied int, skipped int)
language plpgsql security definer set search_path = public as $$
declare years int;
begin
  if not is_hod() then raise exception 'Only the HOD can copy timetables'; end if;
  if p_from = p_to then raise exception 'Choose a different term to copy from'; end if;
  select split_part(t.academic_year, '-', 1)::int - split_part(f.academic_year, '-', 1)::int into years
    from academic_terms t, academic_terms f where t.id = p_to and f.id = p_from;
  if years is null then raise exception 'Unknown term'; end if;
  return query
  with src as (
    select e.*, sb.code src_code, sb.section src_section, sb.cohort_grad_year src_cohort
    from timetable_entries e left join subjects sb on sb.id = e.subject_id
    where e.term_id = p_from
      and (p_sections is null or e.section = any(p_sections))
      and not exists (select 1 from timetable_entries x where x.term_id = p_to and x.section = e.section)
  ), mapped as (
    select src.*, (select n.id from subjects n
                    where n.term_id = p_to and n.code = src.src_code
                      and ((src.src_section is not null and n.section = src.src_section)
                        or (src.src_section is null and n.section is null and n.cohort_grad_year = src.src_cohort + years))
                    limit 1) new_subject
    from src
  ), ins as (
    insert into timetable_entries (term_id, section, day_order, period_no, subject_id, label, audience, audience_value,
                                   group_id, room, faculty_ids, faculty_names, takes_attendance)
    select p_to, m.section, m.day_order, m.period_no, m.new_subject, m.label, m.audience, m.audience_value,
           null, m.room, m.faculty_ids, m.faculty_names, m.takes_attendance
    from mapped m where m.subject_id is null or m.new_subject is not null
    returning timetable_entries.section
  )
  select m.section, (select count(*)::int from ins where ins.section = m.section),
         count(*) filter (where m.subject_id is not null and m.new_subject is null)::int
  from mapped m group by m.section order by m.section;
end $$;
revoke execute on function public.copy_timetable(uuid, uuid, text[]) from public, anon;
grant execute on function public.copy_timetable(uuid, uuid, text[]) to authenticated;

-- ── 3. analysis: topics covered, self check-in ─────────────────────────────
create or replace function public.ana_topics(p_term uuid, p_section text default null, p_subject uuid default null)
returns table (date date, period_no smallint, class text, course text, topic text, taken_by text)
language sql stable security definer set search_path = public as $$
  select s.date, s.period_no, coalesce(s.section, 'Combined'), coalesce(sb.short_name, sb.code, s.label),
         s.topic, p.full_name
  from attendance_sessions s
  left join subjects sb on sb.id = s.subject_id
  left join profiles p on p.id = s.taken_by
  where is_staff() and s.term_id = p_term and s.mode <> 'IMPORT'
    and (p_section is null or s.section = p_section)
    and (p_subject is null or s.subject_id = p_subject)
  order by s.date desc, s.period_no
$$;

create or replace function public.ana_self_checkin(p_term uuid)
returns table (date date, period_no smallint, class text, course text, teacher text,
               on_list int, checked_in int, present int, headcount int, more_than_counted int)
language sql stable security definer set search_path = public as $$
  select s.date, s.period_no, coalesce(s.section, 'Combined'), coalesce(sb.short_name, sb.code, s.label), p.full_name,
         cardinality(s.roster),
         (select count(*)::int from attendance_self_marks m where m.session_id = s.id),
         cardinality(s.roster) - cardinality(s.absent),
         s.headcount,
         greatest(0, cardinality(s.roster) - cardinality(s.absent) - cardinality(s.on_duty) - coalesce(s.headcount, 1000000))
  from attendance_sessions s
  left join subjects sb on sb.id = s.subject_id
  left join profiles p on p.id = s.taken_by
  where is_staff() and s.term_id = p_term and s.mode = 'SELF'
  order by s.date desc, s.period_no
$$;
revoke execute on function public.ana_topics(uuid, text, uuid), public.ana_self_checkin(uuid) from public, anon;
grant execute on function public.ana_topics(uuid, text, uuid), public.ana_self_checkin(uuid) to authenticated;

-- ── 4. HOD powers need two-factor sign-in once an authenticator is set up ──
create or replace function public.is_hod()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (role = 'HOD' or (role = 'PROFESSOR' and access_tier = 1))
       and (coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
            or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified'))
    from profiles where id = auth.uid() and is_active
  ), false)
$$;

-- ── 5. small things ────────────────────────────────────────────────────────
create index if not exists pending_staff_links_linked_to on public.pending_staff_links (linked_to);
insert into public.app_settings (key, value) values ('attendance.projector_code', 'false')
on conflict (key) do nothing;
