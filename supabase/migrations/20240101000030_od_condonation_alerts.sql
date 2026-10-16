-- Phase 3 — attendance completeness.
--  * On-Duty: an OD student is Present (counted as attended) with an OD tag.
--  * Condonation (Regulation 7.2): a student with 65–74% may be permitted to write the
--    semester-end exam only for medical reasons or sports, with documents submitted to
--    the HOD through the class advisor on returning. Requests are raised by the student
--    or advisor, approved/rejected by the HOD (the department's final step; the list is
--    exported for the CoE). Below 65% is SA regardless (7.4). Hours are not altered.
--  * Parent email for shortage alerts; alert log.

-- ── On-Duty ────────────────────────────────────────────────────────────────
alter table public.attendance_sessions add column if not exists on_duty uuid[] not null default '{}';
alter table public.attendance_sessions drop constraint if exists att_od_valid;
alter table public.attendance_sessions add constraint att_od_valid check (on_duty <@ roster);

create or replace function public.att_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if not is_hod() then raise exception 'Only the HOD can delete an attendance hour'; end if;
    return old;
  end if;
  if att_is_locked(old) and not is_hod() then
    raise exception 'Attendance for this hour is locked. Ask the HOD to unlock it.';
  end if;
  if att_is_locked(old) and is_hod() and coalesce(new.edit_reason, '') = coalesce(old.edit_reason, '')
     and (new.absent is distinct from old.absent or new.on_duty is distinct from old.on_duty) then
    raise exception 'Give a reason when changing a locked hour';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.absent  := array(select unnest(new.absent) intersect select unnest(new.roster));
  -- OD students are present: never both absent and on duty
  new.on_duty := array(select unnest(new.on_duty) intersect select unnest(new.roster) except select unnest(new.absent));
  return new;
end $$;
revoke execute on function public.att_guard() from public, anon, authenticated;

drop function if exists public.att_save(uuid, uuid[], text, boolean, text, int);
create or replace function public.att_save(p_session uuid, p_absent uuid[], p_topic text, p_submit boolean,
                                           p_reason text default null, p_headcount int default null, p_on_duty uuid[] default null)
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
revoke execute on function public.att_save(uuid, uuid[], text, boolean, text, int, uuid[]) from public, anon;
grant execute on function public.att_save(uuid, uuid[], text, boolean, text, int, uuid[]) to authenticated;

-- students see their OD hours
drop function if exists public.my_attendance(uuid);
create or replace function public.my_attendance(p_term uuid default null)
returns table (session_id uuid, date date, period_no smallint, subject_id uuid, label text, present boolean, on_duty boolean, topic text, status text)
language sql stable security definer set search_path = public as $$
  select s.id, s.date, s.period_no, s.subject_id, s.label, not (auth.uid() = any(s.absent)), auth.uid() = any(s.on_duty), s.topic, s.status
  from attendance_sessions s
  where auth.uid() = any(s.roster) and s.term_id = coalesce(p_term, current_term_id())
  order by s.date, s.period_no
$$;
revoke execute on function public.my_attendance(uuid) from public, anon;
grant execute on function public.my_attendance(uuid) to authenticated;

drop function if exists public.att_term_summary(uuid, text);
create or replace function public.att_term_summary(p_term uuid, p_section text default null)
returns table (student_id uuid, subject_id uuid, label text, conducted int, attended int, on_duty int)
language sql stable security definer set search_path = public as $$
  select r.sid, s.subject_id, s.label, count(*)::int,
         count(*) filter (where not (r.sid = any(s.absent)))::int,
         count(*) filter (where r.sid = any(s.on_duty))::int
  from attendance_sessions s
  cross join lateral unnest(s.roster) as r(sid)
  where is_staff() and s.term_id = p_term
    and (p_section is null or s.section = p_section
         or (s.section is null and exists (select 1 from profiles p where p.id = r.sid and p.section = p_section)))
  group by r.sid, s.subject_id, s.label
$$;
revoke execute on function public.att_term_summary(uuid, text) from public, anon;
grant execute on function public.att_term_summary(uuid, text) to authenticated;

-- ── Condonation requests ───────────────────────────────────────────────────
create table if not exists public.attendance_condonations (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles(id) on delete cascade,
  term_id       uuid not null references public.academic_terms(id) on delete cascade,
  reason_kind   text not null check (reason_kind in ('MEDICAL', 'SPORTS')),
  from_date     date not null,
  to_date       date not null,
  details       text not null check (length(trim(details)) >= 10),
  document_path text,
  status        text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  requested_by  uuid not null default auth.uid() references public.profiles(id) on delete set null,
  requested_at  timestamptz not null default now(),
  advisor_note  text,
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  check (to_date >= from_date)
);
create index if not exists cond_student on public.attendance_condonations (student_id, term_id);
create index if not exists cond_status on public.attendance_condonations (status, term_id);
create index if not exists cond_requested_by on public.attendance_condonations (requested_by);
create index if not exists cond_decided_by on public.attendance_condonations (decided_by);
create index if not exists cond_term on public.attendance_condonations (term_id);
alter table public.attendance_condonations enable row level security;

drop policy if exists cond_read on public.attendance_condonations;
create policy cond_read on public.attendance_condonations for select to authenticated
  using (student_id = (select auth.uid()) or is_hod() or advises_student(student_id));
-- raise: the student for themselves, or their class advisor / HOD on their behalf
drop policy if exists cond_insert on public.attendance_condonations;
create policy cond_insert on public.attendance_condonations for insert to authenticated
  with check (status = 'PENDING' and decided_by is null and requested_by = (select auth.uid())
              and (student_id = (select auth.uid()) or is_hod() or advises_student(student_id)));
-- only pending requests can be edited, by whoever may raise them; decisions go through att_decide_condonation
drop policy if exists cond_update on public.attendance_condonations;
create policy cond_update on public.attendance_condonations for update to authenticated
  using (status = 'PENDING' and (student_id = (select auth.uid()) or advises_student(student_id) or is_hod()))
  with check (status in ('PENDING', 'WITHDRAWN') and decided_by is null);
drop policy if exists cond_delete on public.attendance_condonations;
create policy cond_delete on public.attendance_condonations for delete to authenticated using (is_hod());

create or replace function public.att_decide_condonation(p_id uuid, p_approve boolean, p_note text default null)
returns public.attendance_condonations
language plpgsql security definer set search_path = public as $$
declare c attendance_condonations;
begin
  if not is_hod() then raise exception 'Only the HOD decides condonation'; end if;
  select * into c from attendance_condonations where id = p_id for update;
  if c.id is null then raise exception 'Request not found'; end if;
  if c.status <> 'PENDING' then raise exception 'This request was already %', lower(c.status); end if;
  update attendance_condonations set status = case when p_approve then 'APPROVED' else 'REJECTED' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = p_note
  where id = p_id returning * into c;
  return c;
end $$;
revoke execute on function public.att_decide_condonation(uuid, boolean, text) from public, anon;
grant execute on function public.att_decide_condonation(uuid, boolean, text) to authenticated;
drop trigger if exists audit_attendance_condonations on public.attendance_condonations;
create trigger audit_attendance_condonations after insert or update or delete on public.attendance_condonations
  for each row execute function public.audit_row();

-- Private bucket for medical / sports documents: <student id>/<file>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('condonation-docs', 'condonation-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists cond_docs_read on storage.objects;
create policy cond_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'condonation-docs' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or is_hod()
    or advises_student(((storage.foldername(name))[1])::uuid)));
drop policy if exists cond_docs_insert on storage.objects;
create policy cond_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'condonation-docs' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or is_hod()
    or advises_student(((storage.foldername(name))[1])::uuid)));

-- ── Parent email and alert log ─────────────────────────────────────────────
alter table public.profiles add column if not exists parent_email text
  check (parent_email is null or parent_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
insert into public.app_settings (key, value) values
  ('alerts.weekly_enabled', 'true'),
  ('alerts.parents', 'true'),
  ('alerts.threshold_percent', '80')
on conflict (key) do nothing;

create table if not exists public.attendance_alert_log (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  term_id    uuid references public.academic_terms(id) on delete set null,
  pct        numeric(5, 1) not null,
  sent_to    text[] not null default '{}',
  week_of    date not null,
  created_at timestamptz not null default now(),
  unique (student_id, week_of)
);
create index if not exists alert_log_term on public.attendance_alert_log (term_id);
alter table public.attendance_alert_log enable row level security;
drop policy if exists alert_log_read on public.attendance_alert_log;
create policy alert_log_read on public.attendance_alert_log for select to authenticated
  using (student_id = (select auth.uid()) or is_hod() or advises_student(student_id));

-- Weekly shortage alerts: students of the current term below the alert threshold
-- (default 80%, so they hear before reaching 75%). Server (service role) only.
create or replace function public.att_alert_candidates(p_threshold numeric default 80)
returns table (student_id uuid, full_name text, email text, parent_email text, section text, advisor_email text,
               hours bigint, attended bigint, pct numeric)
language sql stable security definer set search_path = public as $$
  with t as (select id from academic_terms where is_current limit 1),
  h as (
    select r.sid, count(*) hours, count(*) filter (where not (r.sid = any(s.absent))) att
    from attendance_sessions s cross join lateral unnest(s.roster) r(sid)
    where s.term_id = (select id from t)
    group by r.sid
  )
  select p.id, p.full_name, p.email, p.parent_email, p.section,
         (select a.email from profiles a where a.advisor_section = p.section and a.is_active limit 1),
         h.hours, h.att, round(100.0 * h.att / nullif(h.hours, 0), 1)
  from h join profiles p on p.id = h.sid
  where p.role = 'STUDENT' and p.is_active and h.hours >= 20
    and 100.0 * h.att / nullif(h.hours, 0) < p_threshold
$$;
revoke execute on function public.att_alert_candidates(numeric) from public, anon, authenticated;
grant execute on function public.att_alert_candidates(numeric) to service_role;
