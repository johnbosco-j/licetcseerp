-- Staff who do not have an ERP account yet. When the account is created (or the
-- name is corrected later) the person is linked automatically:
--   * class advisor posts waiting for them (pending_staff_links) are filled, if the
--     section has no advisor yet;
--   * this term's courses with nobody linked whose printed faculty name contains
--     every part of their name get them as instructor.
-- The HOD manages the list in Configuration → Data editor, or with plain SQL.

create table if not exists public.pending_staff_links (
  name_key        text primary key check (name_key = lower(trim(name_key)) and length(name_key) >= 4),
  advisor_section text check (advisor_section in ('I CSE-A','I CSE-B','II CSE-A','II CSE-B','III CSE-A','III CSE-B','IV CSE-A','IV CSE-B')),
  note            text,
  linked_to       uuid references public.profiles(id) on delete set null,
  linked_at       timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.pending_staff_links enable row level security;
drop policy if exists psl_read on public.pending_staff_links;
create policy psl_read on public.pending_staff_links for select to authenticated using (is_staff());
drop policy if exists psl_ins on public.pending_staff_links;
create policy psl_ins on public.pending_staff_links for insert to authenticated with check (is_hod());
drop policy if exists psl_upd on public.pending_staff_links;
create policy psl_upd on public.pending_staff_links for update to authenticated using (is_hod()) with check (is_hod());
drop policy if exists psl_del on public.pending_staff_links;
create policy psl_del on public.pending_staff_links for delete to authenticated using (is_hod());

insert into public.pending_staff_links (name_key, advisor_section, note) values
  ('princess benita', 'I CSE-A', 'Class advisor of I CSE-A (HOD, Oct 2026)'),
  ('saratha',         'I CSE-B', 'Class advisor of I CSE-B (HOD, Oct 2026)')
on conflict (name_key) do nothing;

-- Words of a person's name that identify them (titles and initials dropped).
create or replace function public.name_words(p text)
returns text[] language sql immutable set search_path = public as $$
  select coalesce(array_agg(w), '{}') from (
    select w from regexp_split_to_table(lower(coalesce(p, '')), '[^a-z]+') w
    where length(w) >= 3 and w not in ('dr','mr','mrs','ms','miss','rev','prof','sj','asp','cse','the')
  ) x
$$;

create or replace function public.link_new_staff()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text[] := name_words(new.full_name);
  p pending_staff_links;
  v_term uuid := (select id from academic_terms where is_current limit 1);
begin
  if new.role not in ('PROFESSOR', 'HOD') or not new.is_active or cardinality(me) = 0 then return new; end if;

  -- waiting advisor post: every word of the key appears in the person's name
  for p in select * from pending_staff_links where linked_to is null and advisor_section is not null loop
    if name_words(p.name_key) <@ me
       and new.advisor_section is null
       and not exists (select 1 from profiles x where x.advisor_section = p.advisor_section and x.id <> new.id) then
      update profiles set advisor_section = p.advisor_section where id = new.id;
      update pending_staff_links set linked_to = new.id, linked_at = now() where name_key = p.name_key;
      exit;
    end if;
  end loop;

  -- this term's unlinked courses printed with this person's full name
  -- (a one-word name must be distinctive: at least 6 letters)
  if v_term is not null and (cardinality(me) >= 2 or length(me[1]) >= 6) then
    insert into subject_faculty (subject_id, faculty_id, role)
    select s.id, new.id, 'MAIN' from subjects s
     where s.term_id = v_term and s.faculty_names is not null
       and s.faculty_id is null
       and not exists (select 1 from subject_faculty f where f.subject_id = s.id)
       and me <@ name_words(s.faculty_names)
    on conflict do nothing;
    update subjects s set faculty_id = new.id
     where s.term_id = v_term and s.faculty_id is null
       and exists (select 1 from subject_faculty f where f.subject_id = s.id and f.faculty_id = new.id)
       and not exists (select 1 from subject_faculty f where f.subject_id = s.id and f.faculty_id <> new.id);
  end if;
  return new;
end $$;
revoke execute on function public.link_new_staff() from public, anon, authenticated;

drop trigger if exists link_new_staff on public.profiles;
create trigger link_new_staff after insert or update of full_name, role, is_active on public.profiles
  for each row when (new.role in ('PROFESSOR', 'HOD')) execute function public.link_new_staff();
