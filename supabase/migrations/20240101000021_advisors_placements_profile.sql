-- 1. Class advisors review leave applications from students of their section.
-- 2. Placement offers: which students were selected, by which company, for what package.
-- 3. Every user can update their own contact number (profiles UPDATE is otherwise tier-1 only).

-- ── 1. Class advisors ────────────────────────────────────────────────────────
create or replace function public.advises_student(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from profiles me
    join profiles s on s.section = me.advisor_section
    where me.id = auth.uid()
      and me.role in ('HOD', 'PROFESSOR')
      and me.advisor_section is not null
      and s.id = p_student
      and s.role = 'STUDENT'
  )
$$;
revoke execute on function public.advises_student(uuid) from public, anon;
grant execute on function public.advises_student(uuid) to authenticated;

drop policy if exists leaves_select on public.leaves;
create policy leaves_select on public.leaves for select
  using (applicant_id = auth.uid() or is_hod() or advises_student(applicant_id));

drop policy if exists leaves_update on public.leaves;
create policy leaves_update on public.leaves for update
  using (is_hod() or advises_student(applicant_id))
  with check (is_hod() or advises_student(applicant_id));

alter table public.leaves drop constraint if exists leaves_dates_ok;
alter table public.leaves add constraint leaves_dates_ok check (to_date >= from_date);

-- ── 2. Placement offers ──────────────────────────────────────────────────────
-- Name, roll number, section and batch are copied onto the offer so the
-- department keeps its placement record after graduates are archived and removed.
create table if not exists public.placement_offers (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references public.profiles(id) on delete set null,
  student_name  text not null,
  roll_number   text,
  section       text,
  batch_year    integer,
  placement_id  uuid references public.placements(id) on delete set null,
  company_name  text not null,
  role_title    text,
  package_lpa   numeric(6,2) check (package_lpa is null or package_lpa >= 0),
  offer_type    text not null default 'FULL_TIME' check (offer_type in ('FULL_TIME', 'INTERNSHIP', 'INTERNSHIP_PPO')),
  status        text not null default 'OFFERED' check (status in ('OFFERED', 'ACCEPTED', 'DECLINED', 'JOINED')),
  offer_date    date not null default current_date,
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (student_id, company_name, offer_type)
);
create index if not exists placement_offers_student_idx on public.placement_offers(student_id);
create index if not exists placement_offers_placement_idx on public.placement_offers(placement_id);

alter table public.placement_offers enable row level security;
drop policy if exists offers_select on public.placement_offers;
create policy offers_select on public.placement_offers for select
  using (is_staff() or student_id = auth.uid());
drop policy if exists offers_hod on public.placement_offers;
create policy offers_hod on public.placement_offers for all
  using (is_hod()) with check (is_hod());

drop trigger if exists audit_placement_offers on public.placement_offers;
create trigger audit_placement_offers after insert or update or delete on public.placement_offers
  for each row execute function audit_row();

-- ── 3. Own contact number ────────────────────────────────────────────────────
create or replace function public.update_my_phone(p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if length(digits) = 12 and left(digits, 2) = '91' then
    digits := substr(digits, 3);
  end if;
  if digits <> '' and digits !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a 10-digit Indian mobile number';
  end if;
  update profiles set phone = nullif(digits, ''), updated_at = now() where id = auth.uid();
end $$;
revoke execute on function public.update_my_phone(text) from public, anon;
grant execute on function public.update_my_phone(text) to authenticated;
