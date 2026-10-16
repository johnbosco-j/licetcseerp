-- Phase 1 — security tightening.
--  * Who may take attendance: course instructors, the class advisor, the HOD, or a
--    colleague the instructor delegated the class to. "Any staff" is an HOD switch.
--  * Timing: staff may back-date only a few days and may not open an hour long
--    before it starts. The HOD is not limited.
--  * Self check-in: PIN lockout after repeated wrong PINs; teacher headcount.
--  * Marks: a course without an assigned teacher is editable only by the advisor/HOD.
--  * API surface: trigger functions are not callable, nothing is callable without
--    signing in, GraphQL is off, missing foreign-key indexes, single policy per action.

-- ── settings (HOD-editable) ────────────────────────────────────────────────
insert into public.app_settings (key, value) values
  ('attendance.backdate_days', '2'),
  ('attendance.open_before_minutes', '10'),
  ('attendance.pin_max_attempts', '5'),
  ('attendance.pin_lock_minutes', '15'),
  ('attendance.require_headcount', 'true')
on conflict (key) do nothing;
update public.app_settings set value = 'false' where key = 'attendance.allow_any_staff';
update public.app_settings set value = '10' where key = 'attendance.qr_rotate_seconds';

create or replace function public.setting_text(p_key text, p_default text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value #>> '{}' from app_settings where key = p_key), p_default)
$$;
create or replace function public.ist_now() returns timestamp language sql stable as $$ select (now() at time zone 'Asia/Kolkata') $$;
create or replace function public.ist_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ── delegation: an instructor lets a colleague take their class ────────────
create table if not exists public.attendance_delegations (
  id           uuid primary key default gen_random_uuid(),
  from_faculty uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  to_faculty   uuid not null references public.profiles(id) on delete cascade,
  subject_id   uuid references public.subjects(id) on delete cascade,   -- null = all my classes
  valid_from   date not null,
  valid_to     date not null,
  note         text,
  created_at   timestamptz not null default now(),
  check (valid_to >= valid_from and valid_to - valid_from <= 31),
  check (from_faculty <> to_faculty)
);
create index if not exists att_deleg_to on public.attendance_delegations (to_faculty, valid_from, valid_to);
create index if not exists att_deleg_from on public.attendance_delegations (from_faculty);
create index if not exists att_deleg_subject on public.attendance_delegations (subject_id);
alter table public.attendance_delegations enable row level security;
drop policy if exists deleg_read on public.attendance_delegations;
create policy deleg_read on public.attendance_delegations for select to authenticated
  using (is_hod() or from_faculty = (select auth.uid()) or to_faculty = (select auth.uid()));
drop policy if exists deleg_insert on public.attendance_delegations;
create policy deleg_insert on public.attendance_delegations for insert to authenticated
  with check (is_staff() and (is_hod() or from_faculty = (select auth.uid()))
              and (subject_id is null or is_hod()
                   or exists (select 1 from subject_faculty f where f.subject_id = attendance_delegations.subject_id and f.faculty_id = (select auth.uid()))));
drop policy if exists deleg_delete on public.attendance_delegations;
create policy deleg_delete on public.attendance_delegations for delete to authenticated
  using (is_hod() or from_faculty = (select auth.uid()));

-- ── who may take an hour ───────────────────────────────────────────────────
create or replace function public.att_can_take(p_subject uuid, p_section text, p_entry uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select is_hod() or (is_staff() and (
       setting_text('attendance.allow_any_staff', 'false') = 'true'
    -- the course's instructors
    or (p_subject is not null and exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = auth.uid()))
    or (p_subject is not null and exists (select 1 from subjects s where s.id = p_subject and s.faculty_id = auth.uid()))
    -- named on that timetable hour (e.g. ABSL, Library, a lab assistant)
    or (p_entry is not null and exists (select 1 from timetable_entries e where e.id = p_entry and auth.uid() = any(e.faculty_ids)))
    -- class advisor of the section (or of either section of a combined class)
    or exists (select 1 from profiles me where me.id = auth.uid() and me.advisor_section is not null and (
             me.advisor_section = p_section
          or (p_subject is not null and exists (select 1 from subjects s where s.id = p_subject and s.section is null
                and s.cohort_grad_year = section_grad_year(me.advisor_section, s.term_id)))))
    -- delegated by an instructor for this date
    or exists (select 1 from attendance_delegations d
               where d.to_faculty = auth.uid() and p_date between d.valid_from and d.valid_to
                 and ((d.subject_id is not null and d.subject_id = p_subject)
                   or (d.subject_id is null and (
                          exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = d.from_faculty)
                       or exists (select 1 from timetable_entries e where e.id = p_entry and d.from_faculty = any(e.faculty_ids))))))
  ))
$$;

create or replace function public.att_can_edit(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select att_can_take(s.subject_id, s.section, s.entry_id, s.date) from attendance_sessions s where s.id = p_session), false)
$$;

-- ── extra columns ─────────────────────────────────────────────────────────
alter table public.attendance_sessions add column if not exists headcount smallint check (headcount between 0 and 400);
alter table public.attendance_pins add column if not exists failed_attempts smallint not null default 0,
                                   add column if not exists locked_until timestamptz;

-- ── open an hour: authority + timing ───────────────────────────────────────
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

  insert into attendance_sessions (term_id, date, period_no, section, cohort_grad_year, subject_id, label,
                                   audience, audience_value, group_id, entry_id, roster, taken_by)
  values (v_term, p_date, p_period, v_section, v_cohort, p_subject, p_label,
          coalesce(p_audience, 'ALL'), p_value, p_group, p_entry,
          att_roster(v_section, v_cohort, coalesce(p_audience, 'ALL'), p_value, p_group), auth.uid())
  returning * into s;
  return s;
end $$;

-- ── save: authority + headcount ────────────────────────────────────────────
drop function if exists public.att_save(uuid, uuid[], text, boolean, text);
create or replace function public.att_save(p_session uuid, p_absent uuid[], p_topic text, p_submit boolean,
                                           p_reason text default null, p_headcount int default null)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions; lockmin int := setting_int('attendance.lock_minutes', 10); present int;
begin
  if not is_staff() then raise exception 'Only staff can mark attendance'; end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.id is null then raise exception 'Attendance hour not found'; end if;
  if not att_can_take(s.subject_id, s.section, s.entry_id, s.date) then
    raise exception 'Only the course instructor, class advisor, a delegated colleague or the HOD can mark this hour';
  end if;
  present := cardinality(s.roster) - cardinality(array(select unnest(coalesce(p_absent, '{}')) intersect select unnest(s.roster)));
  if p_submit and s.mode = 'SELF' and setting_text('attendance.require_headcount', 'true') = 'true'
     and coalesce(p_headcount, s.headcount) is null then
    raise exception 'Enter the head count of students in the room before submitting a self check-in';
  end if;
  if p_submit and coalesce(p_headcount, s.headcount) is not null and present > coalesce(p_headcount, s.headcount) then
    raise exception '% marked present but only % counted in the room — mark the extra students absent first', present, coalesce(p_headcount, s.headcount);
  end if;
  update attendance_sessions set
    absent       = coalesce(p_absent, '{}'),
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

create or replace function public.att_refresh_roster(p_session uuid)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions;
begin
  if not att_can_edit(p_session) then raise exception 'Not allowed for this hour'; end if;
  select * into s from attendance_sessions where id = p_session;
  update attendance_sessions
     set roster = att_roster(s.section, s.cohort_grad_year, s.audience, s.audience_value, s.group_id)
   where id = p_session returning * into s;
  return s;
end $$;

create or replace function public.att_self_open(p_session uuid, p_minutes int default 10)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions;
begin
  if not is_staff() then raise exception 'Only staff can open self-marking'; end if;
  if setting_text('attendance.self_mark_enabled', 'true') = 'false' then raise exception 'Self-marking is switched off by the HOD'; end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.id is null then raise exception 'Attendance hour not found'; end if;
  if not att_can_take(s.subject_id, s.section, s.entry_id, s.date) then raise exception 'Only the course instructor can open self check-in for this hour'; end if;
  if s.date <> ist_today() then raise exception 'Self check-in is only for today''s classes'; end if;
  if s.status = 'SUBMITTED' then raise exception 'This hour is already submitted'; end if;
  update attendance_sessions set
    mode = 'SELF',
    absent = case when mode = 'SELF' then absent
                  else array(select unnest(roster) except select student_id from attendance_self_marks where session_id = p_session) end,
    self_open_until = now() + make_interval(mins => greatest(least(p_minutes, 30), 1))
  where id = p_session returning * into s;
  return s;
end $$;

create or replace function public.att_station_mark(p_session uuid, p_register text, p_pin text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s attendance_sessions; st profiles; pin attendance_pins; bound text; other uuid;
  maxtry int := setting_int('attendance.pin_max_attempts', 5);
  lockmin int := setting_int('attendance.pin_lock_minutes', 15);
begin
  if not is_staff() then raise exception 'Station must be signed in as staff'; end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'Unknown class hour'); end if;
  if not att_can_take(s.subject_id, s.section, s.entry_id, s.date) then
    return jsonb_build_object('ok', false, 'error', 'This station is not signed in as the teacher of this class');
  end if;
  if s.mode <> 'SELF' or s.status = 'SUBMITTED' or coalesce(s.self_open_until, '-infinity') < now() then
    return jsonb_build_object('ok', false, 'error', 'Self-marking is closed for this hour');
  end if;
  select * into st from profiles where role = 'STUDENT' and is_active
    and (register_number = trim(p_register) or upper(roll_number) = upper(trim(p_register))) limit 1;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'Register number not found'); end if;
  if not (st.id = any(s.roster)) then return jsonb_build_object('ok', false, 'error', 'You are not on the list for this class'); end if;
  select * into pin from attendance_pins where student_id = st.id for update;
  if pin.student_id is null then return jsonb_build_object('ok', false, 'error', 'Set your attendance PIN in the ERP first (Attendance → Attendance PIN)'); end if;
  if pin.locked_until is not null and pin.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'Too many wrong PINs — try again after ' || to_char(pin.locked_until at time zone 'Asia/Kolkata', 'HH12:MI AM') || ' or ask your teacher to mark you');
  end if;
  if extensions.crypt(coalesce(p_pin, ''), pin.pin_hash) <> pin.pin_hash then
    update attendance_pins set
      locked_until = case when failed_attempts + 1 >= maxtry then now() + make_interval(mins => lockmin) else locked_until end,
      failed_attempts = case when failed_attempts + 1 >= maxtry then 0 else failed_attempts + 1 end
    where student_id = st.id;
    return jsonb_build_object('ok', false, 'error', 'Wrong PIN');
  end if;
  update attendance_pins set failed_attempts = 0, locked_until = null where student_id = st.id;
  if coalesce(p_device, '') = '' then return jsonb_build_object('ok', false, 'error', 'Device not recognised'); end if;

  select device_id into bound from attendance_devices where student_id = st.id;
  select student_id into other from attendance_devices where device_id = p_device;
  if other is not null and other <> st.id then
    return jsonb_build_object('ok', false, 'error', 'This phone is registered to another student');
  end if;
  if bound is null then
    insert into attendance_devices (student_id, device_id) values (st.id, p_device);
  elsif bound <> p_device then
    return jsonb_build_object('ok', false, 'error', 'Use your registered phone, or ask your class advisor to reset it');
  end if;
  if exists (select 1 from attendance_self_marks where session_id = s.id and device_id = p_device and student_id <> st.id) then
    return jsonb_build_object('ok', false, 'error', 'This phone already marked someone else');
  end if;

  insert into attendance_self_marks (session_id, student_id, device_id) values (s.id, st.id, p_device)
  on conflict (session_id, student_id) do nothing;
  update attendance_sessions set absent = array_remove(absent, st.id) where id = s.id;
  return jsonb_build_object('ok', true, 'name', st.full_name, 'register_number', st.register_number);
end $$;

-- ── marks: instructors / advisor / HOD only ───────────────────────────────
create or replace function public.can_edit_subject(p_subject uuid, p_kind text)
returns boolean language sql stable security definer set search_path = public as $$
  select is_hod() or (
    is_staff() and not subject_locked(p_subject, p_kind) and (
         exists (select 1 from subjects s where s.id = p_subject and s.faculty_id = auth.uid())
      or exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = auth.uid())
      or exists (select 1 from subjects s join profiles me on me.id = auth.uid()
                  where s.id = p_subject and me.advisor_section is not null
                    and (s.section = me.advisor_section
                         or (s.section is null and s.cohort_grad_year = section_grad_year(me.advisor_section, s.term_id))))
    ))
$$;

-- ── API surface ───────────────────────────────────────────────────────────
do $$
declare f text;
begin
  -- trigger functions are never called through the API
  foreach f in array array['public.att_audit()', 'public.att_guard()', 'public.audit_row()', 'public.guard_profile_privileges()',
                           'public.compute_ledger_hash()', 'public.audit_log_immutable()', 'public.rls_auto_enable()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
  -- nothing in public is callable without signing in
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' loop
    execute format('revoke execute on function %s from public, anon', f);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
alter function public.att_is_locked(public.attendance_sessions) set search_path = public;
grant execute on function public.att_can_take(uuid, text, uuid, date), public.att_can_edit(uuid), public.setting_text(text, text),
  public.ist_now(), public.ist_today(), public.att_save(uuid, uuid[], text, boolean, text, int) to authenticated;
revoke execute on function public.att_is_locked(public.attendance_sessions) from authenticated;

-- The app talks REST only; GraphQL would let any signed-in user list the schema.
drop extension if exists pg_graphql;

-- pins: deny everything to clients explicitly (functions use them)
drop policy if exists pins_none on public.attendance_pins;
create policy pins_none on public.attendance_pins for all to authenticated using (false) with check (false);

-- ── foreign-key indexes ───────────────────────────────────────────────────
create index if not exists app_settings_updated_by on public.app_settings (updated_by);
create index if not exists att_self_marks_student on public.attendance_self_marks (student_id);
create index if not exists att_sessions_entry on public.attendance_sessions (entry_id);
create index if not exists att_sessions_group on public.attendance_sessions (group_id);
create index if not exists att_sessions_updated_by on public.attendance_sessions (updated_by);
create index if not exists att_verif_subject on public.attendance_verifications (subject_id);
create index if not exists att_verif_term on public.attendance_verifications (term_id);
create index if not exists att_verif_by on public.attendance_verifications (verified_by);
create index if not exists profiles_vertical on public.profiles (vertical);
create index if not exists student_groups_term on public.student_groups (term_id);
create index if not exists subjects_group on public.subjects (group_id);
create index if not exists tt_created_by on public.timetable_entries (created_by);
create index if not exists tt_group on public.timetable_entries (group_id);
create index if not exists tt_subject on public.timetable_entries (subject_id);

-- ── one permissive policy per action: split "FOR ALL" HOD policies ─────────
do $$
declare r record; q text; c text;
begin
  for r in
    select p.tablename, p.policyname, p.qual, p.with_check, p.roles
    from pg_policies p
    where p.schemaname = 'public' and p.cmd = 'ALL'
      and exists (select 1 from pg_policies o where o.schemaname = 'public' and o.tablename = p.tablename and o.cmd = 'SELECT')
  loop
    q := coalesce(r.qual, 'true'); c := coalesce(r.with_check, r.qual, 'true');
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', r.policyname || '_ins', r.tablename, c);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', r.policyname || '_upd', r.tablename, q, c);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', r.policyname || '_del', r.tablename, q);
  end loop;
end $$;

alter function public.ist_now() set search_path = public;
alter function public.ist_today() set search_path = public;
-- internal building blocks: only reachable through the checked att_* functions
revoke execute on function public.att_roster(text, int, text, text, uuid) from authenticated;
