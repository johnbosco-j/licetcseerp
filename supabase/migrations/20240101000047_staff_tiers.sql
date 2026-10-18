-- Staff tiers, enforced here (the app's menus only follow them).
--
--   staff_type 'TEACHING' (default) faculty — tier 2; HOD / access_tier 1 — tier 1
--   staff_type 'ADMIN'    non-teaching administrators: add / edit students, courses and staff
--                         accounts; no marks, attendance, timetable, academics or administration
--   staff_type 'LAB'      lab instructors: take attendance of LAB hours of any class, on the
--                         day and only during the hour; nothing else
--   is_admin              administrator powers on top of a teaching account (e.g. a faculty
--                         member who also manages accounts)
--
-- is_staff() now means TEACHING staff, so every existing policy and function that opened data
-- to "staff" (marks, attendance registers, analytics, outcomes …) stays closed to
-- administrators and lab instructors. Students see only their own class's courses and
-- timetable; faculty see marks only of courses they teach and students they advise.

alter table public.profiles add column if not exists staff_type text not null default 'TEACHING'
  check (staff_type in ('TEACHING', 'ADMIN', 'LAB'));
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.timetable_entries add column if not exists is_lab boolean not null default false;

-- lab hours: lab courses, batch-split hours of lab-integrated courses, and lab-integrated
-- courses timetabled in a block of two or more periods (the HOD can correct any hour)
update public.timetable_entries e set is_lab = true
 from subjects s
 where s.id = e.subject_id
   and (s.course_type = 'LAB'
        or (s.course_type = 'LAB_INTEGRATED'
            and (e.audience = 'BATCH'
                 or exists (select 1 from timetable_entries o
                            where o.term_id = e.term_id and o.section = e.section and o.day_order = e.day_order
                              and o.subject_id = e.subject_id and abs(o.period_no - e.period_no) = 1))));
update public.timetable_entries set is_lab = true where subject_id is null and label ~* '\mlab\M';

-- ── who is who ──────────────────────────────────────────────────────────────
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active and (role = 'HOD' or (role = 'PROFESSOR' and staff_type = 'TEACHING'))
                   from profiles where id = auth.uid()), false)
$$;
create or replace function public.is_lab_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_active and role = 'PROFESSOR' and staff_type = 'LAB' from profiles where id = auth.uid()), false)
$$;
-- administrators: the HOD, non-teaching ADMIN staff, and teaching staff given is_admin
create or replace function public.is_admin_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select is_hod() or coalesce((select is_active and role = 'PROFESSOR' and (staff_type = 'ADMIN' or is_admin)
                                from profiles where id = auth.uid()), false)
$$;

-- ── student-visible courses ─────────────────────────────────────────────────
-- a student's own class courses (any term), the combined courses of their batch (their
-- vertical only), and any course they have marks in
create or replace function public.student_sees_subject(p_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from subjects s join profiles me on me.id = auth.uid() and me.role = 'STUDENT'
    where s.id = p_subject and (
         (s.section is not null and right(s.section, 1) = right(coalesce(me.section, ''), 1)
            and section_grad_year(s.section, s.term_id) = me.batch_year)
      or (s.section is null and s.cohort_grad_year = me.batch_year
            and (s.audience is distinct from 'VERTICAL' or s.audience_value = me.vertical))
      or (s.group_id is not null and exists (select 1 from student_group_members g where g.group_id = s.group_id and g.student_id = me.id))
      or exists (select 1 from marks m where m.subject_id = s.id and m.student_id = me.id)))
$$;

drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects for select to authenticated
  using (is_staff() or is_admin_staff() or is_lab_staff() or student_sees_subject(id));
drop policy if exists subjects_insert on public.subjects;
create policy subjects_insert on public.subjects for insert to authenticated with check (is_admin_staff());
drop policy if exists subjects_update on public.subjects;
create policy subjects_update on public.subjects for update to authenticated using (is_admin_staff()) with check (is_admin_staff());

drop policy if exists subject_faculty_read on public.subject_faculty;
create policy subject_faculty_read on public.subject_faculty for select to authenticated
  using (is_staff() or is_admin_staff() or is_lab_staff() or student_sees_subject(subject_id));
drop policy if exists subject_faculty_hod_ins on public.subject_faculty;
create policy subject_faculty_hod_ins on public.subject_faculty for insert to authenticated with check (is_admin_staff());
drop policy if exists subject_faculty_hod_upd on public.subject_faculty;
create policy subject_faculty_hod_upd on public.subject_faculty for update to authenticated using (is_admin_staff()) with check (is_admin_staff());
drop policy if exists subject_faculty_hod_del on public.subject_faculty;
create policy subject_faculty_hod_del on public.subject_faculty for delete to authenticated using (is_admin_staff());

-- timetable: teaching staff and lab instructors; a student only their own class (and their combined courses)
drop policy if exists timetable_entries_read on public.timetable_entries;
create policy timetable_entries_read on public.timetable_entries for select to authenticated
  using (is_staff() or is_lab_staff() or exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'STUDENT' and me.section = timetable_entries.section)
         or (subject_id is not null and student_sees_subject(subject_id)));

drop policy if exists student_groups_read on public.student_groups;
create policy student_groups_read on public.student_groups for select to authenticated
  using (is_staff() or exists (select 1 from student_group_members g where g.group_id = student_groups.id and g.student_id = auth.uid()));

-- ── profiles ────────────────────────────────────────────────────────────────
-- own row; staff rows (names on courses and notices) for everyone; students for teaching
-- staff, administrators and lab instructors (lab rosters)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or role in ('HOD', 'PROFESSOR') or is_staff() or is_admin_staff() or is_lab_staff());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (is_hod() or (is_admin_staff() and role <> 'HOD')) with check (is_hod() or (is_admin_staff() and role <> 'HOD'));

-- administrators cannot hand out leadership or administrator powers, or change their own tier
create or replace function public.guard_profile_tiers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_hod() then return new; end if;
  if new.role is distinct from old.role or new.access_tier is distinct from old.access_tier
     or new.is_admin is distinct from old.is_admin or new.staff_type is distinct from old.staff_type
     or new.advisor_section is distinct from old.advisor_section or new.can_reset_passwords is distinct from old.can_reset_passwords then
    raise exception 'Only the HOD can change roles, tiers, administrator powers or class advisors' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_tiers on public.profiles;
create trigger guard_profile_tiers before update on public.profiles for each row execute function public.guard_profile_tiers();

-- ── marks: faculty see the courses they teach and the students they advise ──
drop policy if exists marks_select on public.marks;
create policy marks_select on public.marks for select to authenticated
  using (student_id = (select auth.uid()) or is_hod() or (is_staff() and (teaches_subject(subject_id) or advises_student(student_id)
         or can_edit_subject(subject_id, 'MARKS'))));

-- ── lab instructors: lab hours only, on the day, during the hour ─────────────
create or replace function public.lab_hour_open(p_entry uuid, p_date date, p_period smallint default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from timetable_entries e
    join period_slots ps on ps.term_id = e.term_id and ps.period_no = coalesce(p_period, e.period_no)
    where e.id = p_entry and e.is_lab and p_date = ist_today()
      and ist_now() between (p_date + ps.starts_at) - make_interval(mins => setting_int('attendance.open_before_minutes', 10))
                        and (p_date + ps.ends_at) + interval '15 minutes')
$$;

create or replace function public.att_can_take(p_subject uuid, p_section text, p_entry uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select is_hod() or (is_lab_staff() and p_entry is not null and lab_hour_open(p_entry, p_date)) or (is_staff() and (
       setting_text('attendance.allow_any_staff', 'false') = 'true'
    or (p_subject is not null and exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = auth.uid()))
    or (p_subject is not null and exists (select 1 from subjects s where s.id = p_subject and s.faculty_id = auth.uid()))
    or (p_entry is not null and exists (select 1 from timetable_entries e where e.id = p_entry and auth.uid() = any(e.faculty_ids)))
    or exists (select 1 from profiles me where me.id = auth.uid() and me.advisor_section is not null and (
             me.advisor_section = p_section
          or (p_subject is not null and exists (select 1 from subjects s where s.id = p_subject and s.section is null
                and s.cohort_grad_year = section_grad_year(me.advisor_section, s.term_id)))))
    or exists (select 1 from attendance_delegations d
               where d.to_faculty = auth.uid() and p_date between d.valid_from and d.valid_to
                 and ((d.subject_id is not null and d.subject_id = p_subject)
                   or (d.subject_id is null and (
                          exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = d.from_faculty)
                       or exists (select 1 from timetable_entries e where e.id = p_entry and d.from_faculty = any(e.faculty_ids))))))
  ))
$$;

-- the open / save guards admit lab instructors too (att_can_take decides which hours)
do $$
declare f text;
begin
  foreach f in array array['att_open(date,smallint,text,uuid,text,text,text,uuid,uuid)', 'att_save(uuid,uuid[],text,boolean,text,integer,uuid[],timestamp with time zone)'] loop
    execute replace(replace(pg_get_functiondef(('public.' || f)::regprocedure),
      'if not is_staff() then raise exception ''Only staff can take attendance''', 'if not (is_staff() or is_lab_staff()) then raise exception ''Only staff can take attendance'''),
      'if not is_staff() then raise exception ''Only staff can mark attendance''', 'if not (is_staff() or is_lab_staff()) then raise exception ''Only staff can mark attendance''');
  end loop;
end $$;

-- an existing hour opens "for viewing" only for teaching staff; a lab instructor only the hours they may take
do $$
begin
  execute replace(pg_get_functiondef('public.att_open(date,smallint,text,uuid,text,text,text,uuid,uuid)'::regprocedure),
    'if s.id is not null then return s; end if;',
    'if s.id is not null then
    if not is_staff() and not att_can_take(s.subject_id, s.section, s.entry_id, s.date) then
      raise exception ''You can open only today''''s lab hours, during the hour'';
    end if;
    return s;
  end if;');
end $$;

-- a lab instructor sees the hours they took (to correct them within the lock time)
drop policy if exists att_sessions_staff_read on public.attendance_sessions;
create policy att_sessions_staff_read on public.attendance_sessions for select to authenticated
  using (is_staff() or (is_lab_staff() and taken_by = (select auth.uid())));

revoke execute on function public.is_lab_staff(), public.is_admin_staff(), public.student_sees_subject(uuid), public.lab_hour_open(uuid, date, smallint), public.guard_profile_tiers() from public, anon;
grant execute on function public.is_lab_staff(), public.is_admin_staff(), public.student_sees_subject(uuid), public.lab_hour_open(uuid, date, smallint) to authenticated;
