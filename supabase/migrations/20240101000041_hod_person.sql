-- Who is the HOD right now (Configuration → Attendance rules → Head of Department).
-- The HOD office account (role HOD, e.g. hodcse@) passes from one HOD to the next; the
-- person's own courses stay on their personal faculty account. With `hod.person` set,
-- the office account also treats that person's courses as its own ("My classes",
-- dashboard, hand-over), so the HOD can teach from either account. HOD powers remain
-- with the office account only.
--
-- profiles.home_department marks staff of other departments who teach CSE classes
-- (NULL = CSE), so CSE-only lists (HOD, class advisors) can leave them out.

alter table public.profiles add column if not exists home_department text
  check (home_department is null or length(trim(home_department)) between 1 and 40);

insert into public.app_settings (key, value) values ('hod.person', 'null') on conflict (key) do nothing;

create or replace function public.hod_person()
returns uuid language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(value) = 'string' then (value #>> '{}')::uuid end
  from app_settings where key = 'hod.person'
$$;

-- the accounts whose classes the caller teaches: themselves, plus the HOD in person when
-- the caller is the HOD office account
create or replace function public.my_teaching_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select array_remove(array[auth.uid(),
         case when exists (select 1 from profiles where id = auth.uid() and role = 'HOD' and is_active) then hod_person() end], null)
$$;

create or replace function public.teaches_subject(p_subject uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subjects s where s.id = p_subject and s.faculty_id = any(my_teaching_ids()))
      or exists (select 1 from subject_faculty f where f.subject_id = p_subject and f.faculty_id = any(my_teaching_ids()))
$$;

-- only a CSE faculty account can be named as the HOD in person
create or replace function public.check_hod_person()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'hod.person' and jsonb_typeof(new.value) = 'string' and not exists (
       select 1 from profiles where id = (new.value #>> '{}')::uuid and role = 'PROFESSOR' and is_active and home_department is null) then
    raise exception 'Choose an active CSE faculty account as the Head of Department';
  end if;
  return new;
end $$;
drop trigger if exists check_hod_person on public.app_settings;
create trigger check_hod_person before insert or update on public.app_settings
  for each row when (new.key = 'hod.person') execute function public.check_hod_person();

revoke execute on function public.hod_person(), public.my_teaching_ids(), public.check_hod_person() from public, anon;
grant execute on function public.hod_person(), public.my_teaching_ids() to authenticated;
