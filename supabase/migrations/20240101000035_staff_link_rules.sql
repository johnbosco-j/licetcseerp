-- Course linking for new staff, refined:
--   * every teacher printed on a course is linked (co-taught labs list two names);
--     the first becomes MAIN, later ones ASSISTANT;
--   * a name shared by two staff accounts (e.g. "Augustine C" and "Augustine M",
--     whose initials are ignored) is ambiguous and is never linked automatically.

create or replace function public.link_new_staff()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me text[] := name_words(new.full_name);
  p pending_staff_links;
  v_term uuid := (select id from academic_terms where is_current limit 1);
  ambiguous boolean;
begin
  if new.role not in ('PROFESSOR', 'HOD') or not new.is_active or cardinality(me) = 0 then return new; end if;
  ambiguous := exists (select 1 from profiles o where o.id <> new.id and o.role in ('PROFESSOR', 'HOD')
                        and name_words(o.full_name) @> me and name_words(o.full_name) <@ me);

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

  -- this term's courses printed with this person's name (a one-word name must be distinctive)
  if v_term is not null and not ambiguous and (cardinality(me) >= 2 or length(me[1]) >= 6) then
    insert into subject_faculty (subject_id, faculty_id, role)
    select s.id, new.id,
           case when s.faculty_id is null and not exists (select 1 from subject_faculty f where f.subject_id = s.id) then 'MAIN' else 'ASSISTANT' end
      from subjects s
     where s.term_id = v_term and s.faculty_names is not null
       and me <@ name_words(s.faculty_names)
    on conflict do nothing;
    update subjects s set faculty_id = new.id
     where s.term_id = v_term and s.faculty_id is null
       and exists (select 1 from subject_faculty f where f.subject_id = s.id and f.faculty_id = new.id and f.role = 'MAIN');
  end if;
  return new;
end $$;
revoke execute on function public.link_new_staff() from public, anon, authenticated;
