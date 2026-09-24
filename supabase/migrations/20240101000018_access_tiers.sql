-- Access tiers.
--   Tier 1  department leadership: the HOD, plus faculty given tier 1 (e.g. a Vice Principal).
--           Full administrative access, same as the HOD, while still teaching as faculty.
--   Tier 2  faculty (PROFESSOR)
--   Tier 3  students
-- Only the HOD role itself can grant or change tiers, roles, designations and
-- password-admin rights, and nobody else may modify or delete the HOD's profile.

alter table public.profiles
  add column if not exists designation text,
  add column if not exists access_tier smallint check (access_tier in (1, 2, 3));

-- is_hod() is the tier-1 check used by every RLS policy.
create or replace function public.is_hod()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select role = 'HOD' or (role = 'PROFESSOR' and access_tier = 1)
    from profiles where id = auth.uid() and is_active
  ), false)
$$;

create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_is_hod boolean := coalesce(current_user_role() = 'HOD', false);
begin
  -- Service-role scripts and server actions (no end-user JWT) are trusted.
  if auth.uid() is null or actor_is_hod then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'HOD' or old.access_tier = 1 then
      raise exception 'Only the HOD can remove a tier-1 account';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'HOD' or new.access_tier is not null or new.designation is not null or coalesce(new.can_reset_passwords, false) then
      raise exception 'Only the HOD can create accounts with elevated access';
    end if;
    return new;
  end if;

  -- UPDATE
  if old.role = 'HOD' and old.id <> auth.uid() then
    raise exception 'Only the HOD can modify the HOD account';
  end if;
  if new.role is distinct from old.role
     or new.access_tier is distinct from old.access_tier
     or new.designation is distinct from old.designation
     or new.can_reset_passwords is distinct from old.can_reset_passwords then
    raise exception 'Only the HOD can change roles, access tiers, designations or password-admin rights';
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before insert or update or delete on public.profiles
  for each row execute function public.guard_profile_privileges();

-- Dr. Gopalakrishnan K: faculty and Vice Principal, tier 1.
update public.profiles
   set designation = 'Professor & Vice Principal', access_tier = 1
 where email = 'drgk81@licet.ac.in';
