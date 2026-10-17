-- Opening the same class hour from two places at the same moment (a double tap, or
-- the teacher and the class advisor together) used to fail for one of them with a
-- duplicate-key error. att_open now returns the row the other request created.

create or replace function public.att_open(
  p_date date, p_period smallint, p_section text, p_subject uuid, p_label text,
  p_audience text default 'ALL', p_value text default null, p_group uuid default null,
  p_entry uuid default null)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare
  s attendance_sessions;
  subj subjects;
  v_section text := nullif(p_section, '');
  v_cohort int;
  v_term uuid;
  v_start time;
  back int := setting_int('attendance.backdate_days', 2);
  early int := setting_int('attendance.open_before_minutes', 10);
begin
  if not is_staff() then raise exception 'Only staff can take attendance'; end if;
  if p_date > ist_today() then raise exception 'Attendance cannot be taken for a future date'; end if;
  if p_subject is not null then
    select * into subj from subjects where id = p_subject;
    if subj.id is null then raise exception 'Unknown course'; end if;
    v_term := subj.term_id;
    if subj.section is null then v_section := null; v_cohort := subj.cohort_grad_year; end if;
  end if;
  v_term := coalesce(v_term, (select term_id from calendar_days where date = p_date and term_id is not null limit 1), current_term_id());
  if v_section is not null then v_cohort := section_grad_year(v_section, v_term); end if;

  -- an hour that already exists can always be opened for viewing by staff
  select * into s from attendance_sessions a
   where a.date = p_date and a.period_no = p_period
     and coalesce(a.section, '') = coalesce(v_section, '') and coalesce(a.cohort_grad_year, 0) = coalesce(v_cohort, 0)
     and coalesce(a.subject_id::text, a.label) = coalesce(p_subject::text, p_label)
     and a.audience = coalesce(p_audience, 'ALL') and coalesce(a.audience_value, '') = coalesce(p_value, '')
     and coalesce(a.group_id::text, '') = coalesce(p_group::text, '');
  if s.id is not null then return s; end if;

  if not att_can_take(p_subject, coalesce(v_section, p_section), p_entry, p_date) then
    raise exception 'You are not the course instructor or class advisor for this class. Ask the instructor to delegate it to you, or the HOD.';
  end if;
  if not is_hod() then
    if p_date < ist_today() - back then
      raise exception 'Attendance older than % days can only be entered by the HOD', back;
    end if;
    if p_date = ist_today() then
      select starts_at into v_start from period_slots where term_id = v_term and period_no = p_period;
      if v_start is not null and ist_now() < (p_date + v_start) - make_interval(mins => early) then
        raise exception 'Period % has not started yet', p_period;
      end if;
    end if;
  end if;

  begin
    insert into attendance_sessions (term_id, date, period_no, section, cohort_grad_year, subject_id, label,
                                     audience, audience_value, group_id, entry_id, roster, taken_by)
    values (v_term, p_date, p_period, v_section, v_cohort, p_subject, p_label,
            coalesce(p_audience, 'ALL'), p_value, p_group, p_entry,
            att_roster(v_section, v_cohort, coalesce(p_audience, 'ALL'), p_value, p_group), auth.uid())
    returning * into s;
  exception when unique_violation then
    select * into s from attendance_sessions a
     where a.date = p_date and a.period_no = p_period
       and coalesce(a.section, '') = coalesce(v_section, '') and coalesce(a.cohort_grad_year, 0) = coalesce(v_cohort, 0)
       and coalesce(a.subject_id::text, a.label) = coalesce(p_subject::text, p_label)
       and a.audience = coalesce(p_audience, 'ALL') and coalesce(a.audience_value, '') = coalesce(p_value, '')
       and coalesce(a.group_id::text, '') = coalesce(p_group::text, '');
  end;
  return s;
end $$;
