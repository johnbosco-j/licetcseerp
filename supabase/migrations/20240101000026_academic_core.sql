-- Academic core: terms, calendar, periods, lab batches and verticals, course
-- offerings per term, a timetable that allows split cells, and hour-wise
-- attendance (Present / Absent only) that locks a set time after submission.
--
-- Attendance is stored one row per class hour: the roster at that moment and
-- the absentees, both as uuid arrays. That keeps a full year to ~10k rows, so
-- the department can keep many years of registers on the free plan and every
-- hour stays reproducible even after batches, verticals or sections change.

-- ── Settings the HOD can change from the Configuration page ────────────────
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.app_settings (key, value) values
  ('attendance.lock_minutes', '10'),
  ('attendance.min_percent', '75'),
  ('attendance.condonation_percent', '65'),
  ('attendance.self_mark_enabled', 'true'),
  ('attendance.qr_rotate_seconds', '15'),
  ('attendance.allow_any_staff', 'true'),
  ('nav.hidden', '{"FACULTY": [], "STUDENT": []}')
on conflict (key) do nothing;

create or replace function public.setting_int(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from app_settings where key = p_key), p_default)
$$;

-- ── Terms, calendar, periods ────────────────────────────────────────────────
create table if not exists public.academic_terms (
  id            uuid primary key default gen_random_uuid(),
  academic_year text not null check (academic_year ~ '^\d{4}-\d{4}$'),
  parity        text not null check (parity in ('ODD', 'EVEN')),
  label         text not null,
  starts_on     date,
  ends_on       date,
  is_current    boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (academic_year, parity)
);
create unique index if not exists academic_terms_one_current on public.academic_terms (is_current) where is_current;

-- One row per calendar date and audience. scope: ALL, FY (first year) or HS
-- (higher semesters), because first years start later and follow their own days.
-- day_order is the weekday timetable followed that day (1 = Monday … 6 = Saturday),
-- so a Saturday that "follows Monday's order" gets day_order 1.
create table if not exists public.calendar_days (
  date        date not null,
  scope       text not null default 'ALL' check (scope in ('ALL', 'FY', 'HS', 'IV')),
  term_id     uuid references public.academic_terms(id) on delete cascade,
  is_working  boolean not null default true,
  day_order   smallint check (day_order between 1 and 6),
  label       text,
  primary key (date, scope)
);
create index if not exists calendar_days_term on public.calendar_days (term_id, date);

create table if not exists public.period_slots (
  id         uuid primary key default gen_random_uuid(),
  term_id    uuid not null references public.academic_terms(id) on delete cascade,
  period_no  smallint not null check (period_no between 1 and 12),
  starts_at  time not null,
  ends_at    time not null,
  label      text,
  -- null = every year; otherwise only these years of study (e.g. {4} for an evening honours slot)
  years      smallint[],
  unique (term_id, period_no)
);

-- ── Lab batches and verticals ───────────────────────────────────────────────
create table if not exists public.verticals (
  code        text primary key,
  name        text not null,
  description text,
  course_codes text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into public.verticals (code, name, description, course_codes) values
  ('AIML', 'Artificial Intelligence and Machine Learning', 'Vertical VI (R2024)',
     array['PCS2440','PCS2441','PCS2442','PCS2443','PCS2444','PCS2445','PCS2446']),
  ('FSD', 'Full Stack Development', 'Vertical II (R2024)',
     array['PCS2409','PCS2410','PCS2411','PCS2412','PCS2413','PCS2414','PCS2415','PCS2416'])
on conflict (code) do nothing;

alter table public.profiles
  add column if not exists lab_batch smallint check (lab_batch between 1 and 4),
  add column if not exists vertical  text references public.verticals(code) on update cascade on delete set null;

-- Extra groups beyond batch and vertical: honours, minors, open electives, anything ad hoc.
create table if not exists public.student_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             text not null default 'ELECTIVE' check (kind in ('ELECTIVE', 'HONOURS', 'MINOR', 'CUSTOM')),
  cohort_grad_year int,
  section          text,
  term_id          uuid references public.academic_terms(id) on delete set null,
  created_at       timestamptz not null default now()
);
create table if not exists public.student_group_members (
  group_id   uuid not null references public.student_groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  primary key (group_id, student_id)
);
create index if not exists sgm_student on public.student_group_members (student_id);

-- ── Course offerings (subjects) per term ────────────────────────────────────
-- A subject row is one course offered to one class (or, for a vertical or
-- elective, to a whole cohort across sections when section is null).
alter table public.subjects
  add column if not exists term_id          uuid references public.academic_terms(id) on delete set null,
  add column if not exists cohort_grad_year int,
  add column if not exists audience         text not null default 'ALL' check (audience in ('ALL', 'VERTICAL', 'GROUP')),
  add column if not exists audience_value   text,
  add column if not exists group_id         uuid references public.student_groups(id) on delete set null,
  add column if not exists short_name       text,
  add column if not exists course_type      text,
  add column if not exists regulation       text,
  add column if not exists l smallint, add column if not exists t smallint, add column if not exists p smallint,
  add column if not exists faculty_names    text,
  add column if not exists is_active        boolean not null default true;
create index if not exists subjects_term on public.subjects (term_id, section);

create table if not exists public.subject_faculty (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  faculty_id uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'MAIN' check (role in ('MAIN', 'ASSISTANT')),
  primary key (subject_id, faculty_id)
);
create index if not exists subject_faculty_faculty on public.subject_faculty (faculty_id);

-- ── Timetable ───────────────────────────────────────────────────────────────
-- Several entries may share one (section, day, period) cell: that is a split
-- hour, e.g. batch 1 in the OS lab while batch 2 is in the MPMC lab, or the AI&ML
-- vertical in one course while Full Stack is in another.
create table if not exists public.timetable_entries (
  id               uuid primary key default gen_random_uuid(),
  term_id          uuid not null references public.academic_terms(id) on delete cascade,
  section          text not null,
  day_order        smallint not null check (day_order between 1 and 6),
  period_no        smallint not null check (period_no between 1 and 12),
  subject_id       uuid references public.subjects(id) on delete set null,
  label            text,
  audience         text not null default 'ALL' check (audience in ('ALL', 'BATCH', 'VERTICAL', 'GROUP')),
  audience_value   text,
  group_id         uuid references public.student_groups(id) on delete set null,
  room             text,
  faculty_ids      uuid[] not null default '{}',
  faculty_names    text,
  takes_attendance boolean not null default true,
  effective_from   date,
  effective_to     date,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (subject_id is not null or label is not null)
);
create index if not exists tt_lookup on public.timetable_entries (term_id, section, day_order, period_no);

-- ── Attendance ──────────────────────────────────────────────────────────────
create table if not exists public.attendance_sessions (
  id               uuid primary key default gen_random_uuid(),
  term_id          uuid references public.academic_terms(id) on delete set null,
  date             date not null,
  period_no        smallint not null check (period_no between 1 and 12),
  section          text,             -- null for a cohort-wide (vertical / elective) class
  cohort_grad_year int,
  subject_id       uuid references public.subjects(id) on delete set null,
  label            text,
  audience         text not null default 'ALL' check (audience in ('ALL', 'BATCH', 'VERTICAL', 'GROUP')),
  audience_value   text,
  group_id         uuid references public.student_groups(id) on delete set null,
  entry_id         uuid references public.timetable_entries(id) on delete set null,
  roster           uuid[] not null default '{}',
  absent           uuid[] not null default '{}',
  topic            text,
  mode             text not null default 'MANUAL' check (mode in ('MANUAL', 'SELF', 'IMPORT')),
  status           text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED')),
  taken_by         uuid references public.profiles(id) on delete set null,
  submitted_at     timestamptz,
  lock_at          timestamptz,
  unlocked_until   timestamptz,
  self_open_until  timestamptz,
  edit_reason      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null,
  check (subject_id is not null or label is not null),
  check (absent <@ roster)
);
create unique index if not exists att_sessions_unique on public.attendance_sessions
  (date, period_no, coalesce(section, ''), coalesce(cohort_grad_year, 0),
   coalesce(subject_id::text, label), audience, coalesce(audience_value, ''), coalesce(group_id::text, ''));
create index if not exists att_sessions_term_section on public.attendance_sessions (term_id, section, date);
create index if not exists att_sessions_subject on public.attendance_sessions (subject_id, date);
create index if not exists att_sessions_roster on public.attendance_sessions using gin (roster);
create index if not exists att_sessions_taken_by on public.attendance_sessions (taken_by, date);

-- Self-marking: a student's own phone, bound once, proves who they are; the
-- staff member's attendance station (on its own Wi-Fi) proves they are in the room.
create table if not exists public.attendance_devices (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  device_id  text not null unique,
  bound_at   timestamptz not null default now()
);
create table if not exists public.attendance_pins (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  pin_hash   text not null,
  set_at     timestamptz not null default now()
);
create table if not exists public.attendance_self_marks (
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  device_id  text,
  marked_at  timestamptz not null default now(),
  primary key (session_id, student_id)
);
-- HOD verification of registers (Regulations 11.9: at least three times a semester).
create table if not exists public.attendance_verifications (
  id          uuid primary key default gen_random_uuid(),
  term_id     uuid references public.academic_terms(id) on delete set null,
  section     text,
  subject_id  uuid references public.subjects(id) on delete set null,
  upto_date   date not null,
  remarks     text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz not null default now()
);

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.current_term_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from academic_terms where is_current limit 1
$$;

create or replace function public.section_grad_year(p_section text, p_term uuid default null)
returns int language sql stable security definer set search_path = public as $$
  -- "III CSE-A" in AY 2026-2027 → 2028. Year of study = I/II/III/IV.
  select case split_part(p_section, ' ', 1)
           when 'I' then 3 when 'II' then 2 when 'III' then 1 when 'IV' then 0 end
         + split_part(coalesce((select academic_year from academic_terms where id = coalesce(p_term, current_term_id())), '2026-2027'), '-', 2)::int
$$;

-- Students a class hour is meant for. Uses the students' current batch/vertical,
-- which is why every session stores its own roster snapshot.
create or replace function public.att_roster(
  p_section text, p_cohort int, p_audience text, p_value text, p_group uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(p.id order by p.register_number nulls last, p.full_name), '{}')
  from profiles p
  where p.role = 'STUDENT' and p.is_active
    and (p_section is null or p.section = p_section)
    and (p_section is not null or p_cohort is null or p.batch_year = p_cohort)
    and case p_audience
          when 'BATCH'    then p.lab_batch::text = p_value
          when 'VERTICAL' then p.vertical = p_value
          when 'GROUP'    then exists (select 1 from student_group_members m where m.group_id = p_group and m.student_id = p.id)
          else true end
$$;

create or replace function public.att_is_locked(s public.attendance_sessions)
returns boolean language sql stable as $$
  select s.status = 'SUBMITTED' and s.lock_at is not null and now() > s.lock_at
         and coalesce(s.unlocked_until, '-infinity'::timestamptz) < now()
$$;

-- Lock guard: staff edits only while unlocked; the HOD/VP may correct with a reason.
create or replace function public.att_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;   -- imports, maintenance
  if tg_op = 'DELETE' then
    if not is_hod() then raise exception 'Only the HOD can delete an attendance hour'; end if;
    return old;
  end if;
  if att_is_locked(old) and not is_hod() then
    raise exception 'Attendance for this hour is locked. Ask the HOD to unlock it.';
  end if;
  if att_is_locked(old) and is_hod() and coalesce(new.edit_reason, '') = coalesce(old.edit_reason, '')
     and (new.absent is distinct from old.absent) then
    raise exception 'Give a reason when changing a locked hour';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.absent := array(select unnest(new.absent) intersect select unnest(new.roster));
  return new;
end $$;
drop trigger if exists att_sessions_guard on public.attendance_sessions;
create trigger att_sessions_guard before update or delete on public.attendance_sessions
  for each row execute function public.att_guard();

-- Audit only changes after submission (not every draft keystroke or the bulk import).
create or replace function public.att_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' or old.status = 'SUBMITTED' then
    insert into audit_log (actor, actor_role, action, table_name, row_id, old_data, new_data)
    values (auth.uid(), current_user_role()::text, tg_op, 'attendance_sessions', old.id::text,
            jsonb_build_object('absent', old.absent, 'status', old.status, 'topic', old.topic),
            case when tg_op = 'UPDATE' then jsonb_build_object('absent', new.absent, 'status', new.status, 'topic', new.topic, 'reason', new.edit_reason) end);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists att_sessions_audit on public.attendance_sessions;
create trigger att_sessions_audit after update or delete on public.attendance_sessions
  for each row execute function public.att_audit();

-- Open (or fetch) the attendance record for one hour.
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
begin
  if not is_staff() then raise exception 'Only staff can take attendance'; end if;
  if p_date > current_date then raise exception 'Attendance cannot be taken for a future date'; end if;
  if p_subject is not null then
    select * into subj from subjects where id = p_subject;
    if subj.id is null then raise exception 'Unknown course'; end if;
    v_term := subj.term_id;
    if subj.section is null then          -- cohort-wide offering (vertical / elective)
      v_section := null; v_cohort := subj.cohort_grad_year;
    end if;
  end if;
  v_term := coalesce(v_term, (select term_id from calendar_days where date = p_date and term_id is not null limit 1), current_term_id());
  if v_section is not null then v_cohort := section_grad_year(v_section, v_term); end if;

  select * into s from attendance_sessions a
   where a.date = p_date and a.period_no = p_period
     and coalesce(a.section, '') = coalesce(v_section, '') and coalesce(a.cohort_grad_year, 0) = coalesce(v_cohort, 0)
     and coalesce(a.subject_id::text, a.label) = coalesce(p_subject::text, p_label)
     and a.audience = coalesce(p_audience, 'ALL') and coalesce(a.audience_value, '') = coalesce(p_value, '')
     and coalesce(a.group_id::text, '') = coalesce(p_group::text, '');
  if s.id is not null then return s; end if;

  insert into attendance_sessions (term_id, date, period_no, section, cohort_grad_year, subject_id, label,
                                   audience, audience_value, group_id, entry_id, roster, taken_by)
  values (v_term, p_date, p_period, v_section, v_cohort, p_subject, p_label,
          coalesce(p_audience, 'ALL'), p_value, p_group, p_entry,
          att_roster(v_section, v_cohort, coalesce(p_audience, 'ALL'), p_value, p_group), auth.uid())
  returning * into s;
  return s;
end $$;

-- Save marks for an hour; p_submit = true starts the lock countdown.
create or replace function public.att_save(p_session uuid, p_absent uuid[], p_topic text, p_submit boolean, p_reason text default null)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions; lockmin int := setting_int('attendance.lock_minutes', 10);
begin
  if not is_staff() then raise exception 'Only staff can mark attendance'; end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.id is null then raise exception 'Attendance hour not found'; end if;
  update attendance_sessions set
    absent       = coalesce(p_absent, '{}'),
    topic        = coalesce(p_topic, topic),
    edit_reason  = coalesce(p_reason, edit_reason),
    taken_by     = coalesce(taken_by, auth.uid()),
    status       = case when p_submit then 'SUBMITTED' else status end,
    submitted_at = case when p_submit and submitted_at is null then now() else submitted_at end,
    lock_at      = case when p_submit and submitted_at is null then now() + make_interval(mins => lockmin) else lock_at end,
    self_open_until = case when p_submit then null else self_open_until end
  where id = p_session
  returning * into s;
  return s;
end $$;

create or replace function public.att_unlock(p_session uuid, p_minutes int default 30)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions;
begin
  if not is_hod() then raise exception 'Only the HOD can unlock attendance'; end if;
  update attendance_sessions set unlocked_until = now() + make_interval(mins => greatest(p_minutes, 1))
   where id = p_session returning * into s;
  return s;
end $$;

-- Re-take the roster (e.g. a student joined late). Keeps absentees who are still on it.
create or replace function public.att_refresh_roster(p_session uuid)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions;
begin
  if not is_staff() then raise exception 'Only staff can do this'; end if;
  select * into s from attendance_sessions where id = p_session;
  update attendance_sessions
     set roster = att_roster(s.section, s.cohort_grad_year, s.audience, s.audience_value, s.group_id)
   where id = p_session returning * into s;
  return s;
end $$;

-- ── Self-marking (QR + attendance station) ──────────────────────────────────
create or replace function public.att_set_pin(p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if current_user_role() is distinct from 'STUDENT' then raise exception 'Only students set an attendance PIN'; end if;
  if p_pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
  insert into attendance_pins (student_id, pin_hash) values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (student_id) do update set pin_hash = excluded.pin_hash, set_at = now();
end $$;

create or replace function public.att_reset_device(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (is_hod() or advises_student(p_student)) then raise exception 'Only the HOD or class advisor can reset a device'; end if;
  delete from attendance_devices where student_id = p_student;
end $$;

create or replace function public.att_self_open(p_session uuid, p_minutes int default 10)
returns public.attendance_sessions
language plpgsql security definer set search_path = public as $$
declare s attendance_sessions;
begin
  if not is_staff() then raise exception 'Only staff can open self-marking'; end if;
  if (select value #>> '{}' from app_settings where key = 'attendance.self_mark_enabled') = 'false' then
    raise exception 'Self-marking is switched off by the HOD';
  end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.status = 'SUBMITTED' then raise exception 'This hour is already submitted'; end if;
  update attendance_sessions set
    mode = 'SELF',
    -- everyone starts absent; each phone that checks in becomes present
    absent = case when mode = 'SELF' then absent
                  else array(select unnest(roster) except select student_id from attendance_self_marks where session_id = p_session) end,
    self_open_until = now() + make_interval(mins => greatest(least(p_minutes, 60), 1))
  where id = p_session returning * into s;
  return s;
end $$;

-- Called by the staff member's attendance station for each student phone that
-- reached it over the station's local network. The station has already checked
-- the rotating QR nonce; here we check identity (PIN + bound device) and the roster.
create or replace function public.att_station_mark(p_session uuid, p_register text, p_pin text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s attendance_sessions; st profiles; pin text; bound text; other uuid;
begin
  if not is_staff() then raise exception 'Station must be signed in as staff'; end if;
  select * into s from attendance_sessions where id = p_session for update;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'Unknown class hour'); end if;
  if s.mode <> 'SELF' or s.status = 'SUBMITTED' or coalesce(s.self_open_until, '-infinity') < now() then
    return jsonb_build_object('ok', false, 'error', 'Self-marking is closed for this hour');
  end if;
  select * into st from profiles where role = 'STUDENT' and is_active
    and (register_number = trim(p_register) or upper(roll_number) = upper(trim(p_register))) limit 1;
  if st.id is null then return jsonb_build_object('ok', false, 'error', 'Register number not found'); end if;
  if not (st.id = any(s.roster)) then return jsonb_build_object('ok', false, 'error', 'You are not on the list for this class'); end if;
  select pin_hash into pin from attendance_pins where student_id = st.id;
  if pin is null then return jsonb_build_object('ok', false, 'error', 'Set your attendance PIN in the ERP first (Profile → Attendance PIN)'); end if;
  if extensions.crypt(p_pin, pin) <> pin then return jsonb_build_object('ok', false, 'error', 'Wrong PIN'); end if;
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

-- ── Reports ─────────────────────────────────────────────────────────────────
-- Per student per course for a term (staff). Overall % follows Regulation 7.1:
-- periods attended in all courses ÷ periods conducted.
create or replace function public.att_term_summary(p_term uuid, p_section text default null)
returns table (student_id uuid, subject_id uuid, label text, conducted int, attended int)
language sql stable security definer set search_path = public as $$
  select r.sid, s.subject_id, s.label, count(*)::int, count(*) filter (where not (r.sid = any(s.absent)))::int
  from attendance_sessions s
  cross join lateral unnest(s.roster) as r(sid)
  where is_staff() and s.term_id = p_term and s.status in ('SUBMITTED', 'DRAFT')
    and (p_section is null or s.section = p_section
         or (s.section is null and exists (select 1 from profiles p where p.id = r.sid and p.section = p_section)))
  group by r.sid, s.subject_id, s.label
$$;

-- A student's own record: one row per hour (no classmates' data).
create or replace function public.my_attendance(p_term uuid default null)
returns table (session_id uuid, date date, period_no smallint, subject_id uuid, label text, present boolean, topic text, status text)
language sql stable security definer set search_path = public as $$
  select s.id, s.date, s.period_no, s.subject_id, s.label, not (auth.uid() = any(s.absent)), s.topic, s.status
  from attendance_sessions s
  where auth.uid() = any(s.roster) and s.term_id = coalesce(p_term, current_term_id())
  order by s.date, s.period_no
$$;

-- ── Row level security ──────────────────────────────────────────────────────
alter table public.app_settings enable row level security;
alter table public.academic_terms enable row level security;
alter table public.calendar_days enable row level security;
alter table public.period_slots enable row level security;
alter table public.verticals enable row level security;
alter table public.student_groups enable row level security;
alter table public.student_group_members enable row level security;
alter table public.subject_faculty enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_devices enable row level security;
alter table public.attendance_pins enable row level security;
alter table public.attendance_self_marks enable row level security;
alter table public.attendance_verifications enable row level security;

do $$
declare t text;
begin
  -- Reference data everyone signed in can read; only tier 1 edits.
  foreach t in array array['app_settings','academic_terms','calendar_days','period_slots','verticals',
                           'student_groups','subject_faculty','timetable_entries'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_hod on public.%1$s', t);
    execute format('create policy %1$s_hod on public.%1$s for all to authenticated using (is_hod()) with check (is_hod())', t);
  end loop;
end $$;

drop policy if exists sgm_read on public.student_group_members;
create policy sgm_read on public.student_group_members for select to authenticated
  using (is_staff() or student_id = (select auth.uid()));
drop policy if exists sgm_hod on public.student_group_members;
create policy sgm_hod on public.student_group_members for all to authenticated using (is_hod()) with check (is_hod());

-- Sessions: staff read all; writes go through att_* functions (direct writes HOD only).
drop policy if exists att_sessions_staff_read on public.attendance_sessions;
create policy att_sessions_staff_read on public.attendance_sessions for select to authenticated using (is_staff());
drop policy if exists att_sessions_hod on public.attendance_sessions;
create policy att_sessions_hod on public.attendance_sessions for all to authenticated using (is_hod()) with check (is_hod());

drop policy if exists att_devices_read on public.attendance_devices;
create policy att_devices_read on public.attendance_devices for select to authenticated
  using (student_id = (select auth.uid()) or is_hod() or advises_student(student_id));
drop policy if exists att_self_read on public.attendance_self_marks;
create policy att_self_read on public.attendance_self_marks for select to authenticated
  using (is_staff() or student_id = (select auth.uid()));
drop policy if exists att_verif_read on public.attendance_verifications;
create policy att_verif_read on public.attendance_verifications for select to authenticated using (is_staff());
drop policy if exists att_verif_hod on public.attendance_verifications;
create policy att_verif_hod on public.attendance_verifications for all to authenticated using (is_hod()) with check (is_hod());
-- attendance_pins: no policies → only the security-definer functions can touch it.

revoke all on function public.att_open(date, smallint, text, uuid, text, text, text, uuid, uuid) from public, anon;
revoke all on function public.att_save(uuid, uuid[], text, boolean, text) from public, anon;
revoke all on function public.att_unlock(uuid, int) from public, anon;
revoke all on function public.att_refresh_roster(uuid) from public, anon;
revoke all on function public.att_set_pin(text) from public, anon;
revoke all on function public.att_reset_device(uuid) from public, anon;
revoke all on function public.att_self_open(uuid, int) from public, anon;
revoke all on function public.att_station_mark(uuid, text, text, text) from public, anon;
revoke all on function public.att_term_summary(uuid, text) from public, anon;
revoke all on function public.my_attendance(uuid) from public, anon;
revoke all on function public.att_roster(text, int, text, text, uuid) from public, anon;
grant execute on function public.att_open(date, smallint, text, uuid, text, text, text, uuid, uuid),
  public.att_save(uuid, uuid[], text, boolean, text), public.att_unlock(uuid, int),
  public.att_refresh_roster(uuid), public.att_set_pin(text), public.att_reset_device(uuid),
  public.att_self_open(uuid, int), public.att_station_mark(uuid, text, text, text),
  public.att_term_summary(uuid, text), public.my_attendance(uuid), public.att_roster(text, int, text, text, uuid),
  public.current_term_id(), public.section_grad_year(text, uuid), public.setting_int(text, int)
  to authenticated;

-- Audit configuration changes the same way as other core tables.
do $$
declare t text;
begin
  foreach t in array array['app_settings','academic_terms','timetable_entries','verticals','subject_faculty','student_groups'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row()', t);
  end loop;
end $$;
