-- A scheme missing "parts" or "comps" made the check NULL, which passes; refuse it.
alter table public.subjects drop constraint if exists subjects_cia_scheme_check;
alter table public.subjects add constraint subjects_cia_scheme_check check (cia_scheme is null or coalesce(
  jsonb_typeof(cia_scheme) = 'object'
  and jsonb_typeof(cia_scheme->'parts') = 'array' and jsonb_array_length(cia_scheme->'parts') between 1 and 4
  and jsonb_typeof(cia_scheme->'comps') = 'array' and jsonb_array_length(cia_scheme->'comps') between 1 and 40
  and pg_column_size(cia_scheme) < 20000, false));
