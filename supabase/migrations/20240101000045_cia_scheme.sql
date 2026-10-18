-- CIA marks segmented like the department's IA workbooks.
--  * marks.absent: "AB" in a sheet (counts as 0; a special test can replace an absent CAT).
--  * subjects.cia_scheme: the offering's own scheme — which components each CIA has (CT, CAT,
--    ABA, assignment, LP, PT …), each written out of its own maximum and counted with a weight,
--    and the parts (theory / lab) with their internal marks. NULL = the default for the course
--    type (src/lib/cia-scheme.ts). Teachers of the course and the HOD set it.

alter table public.marks add column if not exists absent boolean not null default false;
alter table public.subjects add column if not exists cia_scheme jsonb
  check (cia_scheme is null or (jsonb_typeof(cia_scheme) = 'object'
    and jsonb_typeof(cia_scheme->'parts') = 'array' and jsonb_typeof(cia_scheme->'comps') = 'array'
    and jsonb_array_length(cia_scheme->'comps') between 1 and 40 and pg_column_size(cia_scheme) < 20000));

create or replace function public.set_cia_scheme(p_subject uuid, p_scheme jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_edit_subject(p_subject, 'MARKS') then
    raise exception 'Only the teachers of this course or the HOD can change its assessment scheme' using errcode = '42501';
  end if;
  update subjects set cia_scheme = p_scheme where id = p_subject;
  if not found then raise exception 'No such course'; end if;
end $$;

revoke execute on function public.set_cia_scheme(uuid, jsonb) from public, anon;
grant execute on function public.set_cia_scheme(uuid, jsonb) to authenticated;
