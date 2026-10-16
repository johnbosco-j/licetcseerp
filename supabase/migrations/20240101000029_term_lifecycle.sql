-- Phase 2 — term lifecycle. The current academic term drives odd/even everywhere.
-- Starting the next term: (odd term of a new year → run_promotion first), then
-- start_term() creates/reuses the term, carries the period timings over and makes it
-- current. Courses are then added from the curriculum and the calendar imported.

create or replace function public.start_term(
  p_year text, p_parity text, p_starts date, p_ends date,
  p_copy_periods boolean default true, p_make_current boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t uuid; cur uuid := current_term_id();
  v_label text;
begin
  if not is_hod() then raise exception 'Only the HOD can start a term'; end if;
  if p_year !~ '^\d{4}-\d{4}$' or split_part(p_year, '-', 2)::int <> split_part(p_year, '-', 1)::int + 1 then
    raise exception 'Academic year must look like 2026-2027';
  end if;
  if p_parity not in ('ODD', 'EVEN') then raise exception 'Semester must be ODD or EVEN'; end if;
  if p_ends is not null and p_starts is not null and p_ends < p_starts then raise exception 'The term cannot end before it starts'; end if;
  v_label := format('AY %s-%s %s', split_part(p_year, '-', 1), right(split_part(p_year, '-', 2), 2), initcap(p_parity));

  insert into academic_terms (academic_year, parity, label, starts_on, ends_on)
  values (p_year, p_parity, v_label, p_starts, p_ends)
  on conflict (academic_year, parity) do update set starts_on = coalesce(excluded.starts_on, academic_terms.starts_on),
                                                    ends_on = coalesce(excluded.ends_on, academic_terms.ends_on)
  returning id into t;

  if p_copy_periods and cur is not null and cur <> t and not exists (select 1 from period_slots where term_id = t) then
    insert into period_slots (term_id, period_no, starts_at, ends_at, label, years)
    select t, ps.period_no, ps.starts_at, ps.ends_at, ps.label, ps.years from period_slots ps where ps.term_id = cur;
  end if;

  if p_make_current then
    update academic_terms set is_current = false where is_current and id <> t;
    update academic_terms set is_current = true where id = t;
  end if;
  return t;
end $$;

revoke execute on function public.start_term(text, text, date, date, boolean, boolean) from public, anon;
grant execute on function public.start_term(text, text, date, date, boolean, boolean) to authenticated;

-- What the app needs at sign-in: the current term (drives odd/even and semester start).
create or replace function public.current_academic_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('academic_year', academic_year, 'promoted_at', promotion_date)
                     from promotion_log order by promotion_date desc limit 1), '{}'::jsonb)
      || coalesce((select jsonb_build_object('term_id', id, 'term_label', label, 'term_parity', parity,
                                             'term_year', academic_year, 'term_starts', starts_on, 'term_ends', ends_on)
                     from academic_terms where is_current limit 1), '{}'::jsonb)
$$;

-- Graduated students are archived and locked, never deleted, so every year's
-- registers stay readable with names. archived_at marks those already archived.
alter table public.profiles add column if not exists archived_at timestamptz;
