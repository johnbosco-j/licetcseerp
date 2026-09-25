-- Safe year-end promotion.
-- Promotion used to run as eight separate browser requests: a dropped connection
-- could leave the department half-promoted and still mark the year as done.
-- It now runs as one database transaction (all or nothing), can run only once
-- per academic year, and the latest run can be reverted from its own history.

-- 1. Once per academic year, enforced by the database.
create unique index if not exists promotion_log_academic_year_key on public.promotion_log (academic_year);

-- 2. Correct the recorded semesters: promotion moves a student from the end of
--    one year (even semester) to the start of the next (odd semester).
update public.student_promotion_history
   set to_sem = from_sem + 1
 where to_section <> 'GRADUATED' and to_sem = from_sem + 2;

-- 3. Promotion.
create or replace function public.run_promotion(p_academic_year text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  map constant text[][] := array[
    ['IV CSE-A', 'GRADUATED', '8'], ['IV CSE-B', 'GRADUATED', '8'],
    ['III CSE-A', 'IV CSE-A', '6'], ['III CSE-B', 'IV CSE-B', '6'],
    ['II CSE-A', 'III CSE-A', '4'], ['II CSE-B', 'III CSE-B', '4'],
    ['I CSE-A', 'II CSE-A', '2'],   ['I CSE-B', 'II CSE-B', '2']];
  ay text := trim(p_academic_year);
  i int; ids uuid[]; promoted int := 0; graduated int := 0;
  by_section jsonb := '{}';
begin
  if not is_hod() then raise exception 'Only the HOD or Vice Principal can run promotion'; end if;
  if ay !~ '^\d{4}-\d{4}$' or split_part(ay, '-', 2)::int <> split_part(ay, '-', 1)::int + 1 then
    raise exception 'Academic year must look like 2027-2028';
  end if;
  -- Serialise concurrent attempts, then refuse a second run for the same year.
  perform pg_advisory_xact_lock(hashtext('run_promotion'));
  if exists (select 1 from promotion_log where academic_year = ay) then
    raise exception 'Promotion for % has already been run', ay;
  end if;

  -- Final year first, so no student is moved twice.
  for i in 1 .. array_length(map, 1) loop
    select coalesce(array_agg(id), '{}') into ids
      from profiles where role = 'STUDENT' and section = map[i][1];
    continue when cardinality(ids) = 0;

    insert into student_promotion_history (student_id, from_section, to_section, from_sem, to_sem, academic_year)
    select unnest(ids), map[i][1], map[i][2], map[i][3]::int,
           case when map[i][2] = 'GRADUATED' then 9 else map[i][3]::int + 1 end, ay;

    if map[i][2] = 'GRADUATED' then
      update profiles set section = 'GRADUATED', is_active = false where id = any(ids);
      graduated := graduated + cardinality(ids);
    else
      update profiles set section = map[i][2] where id = any(ids);
      promoted := promoted + cardinality(ids);
    end if;
    by_section := by_section || jsonb_build_object(map[i][1], cardinality(ids));
  end loop;

  insert into promotion_log (academic_year, promoted_count, graduated_count, run_by, notes)
  values (ay, promoted, graduated, auth.uid(), 'Promotion run for AY ' || ay);

  return jsonb_build_object('academic_year', ay, 'promoted', promoted, 'graduated', graduated, 'by_section', by_section);
end $$;

-- 4. Undo the most recent promotion (e.g. run by mistake). Students go back to the
--    section recorded in the history; graduates are reactivated. Graduates whose
--    accounts were already removed cannot be restored this way (they are archived).
create or replace function public.revert_promotion(p_academic_year text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ay text := trim(p_academic_year);
  restored int;
begin
  if not is_hod() then raise exception 'Only the HOD or Vice Principal can revert a promotion'; end if;
  perform pg_advisory_xact_lock(hashtext('run_promotion'));
  if not exists (select 1 from promotion_log where academic_year = ay) then
    raise exception 'No promotion found for %', ay;
  end if;
  if exists (select 1 from promotion_log where promotion_date > (select promotion_date from promotion_log where academic_year = ay)) then
    raise exception 'Only the most recent promotion can be reverted';
  end if;

  update profiles p
     set section = h.from_section,
         is_active = case when h.to_section = 'GRADUATED' then true else p.is_active end
    from student_promotion_history h
   where h.academic_year = ay and h.student_id = p.id and p.section = h.to_section;
  get diagnostics restored = row_count;

  delete from student_promotion_history where academic_year = ay;
  delete from promotion_log where academic_year = ay;
  return jsonb_build_object('academic_year', ay, 'restored', restored);
end $$;

-- 5. Academic state every signed-in user may read: which academic year has been
--    promoted into, and when. Drives the odd/even semester calculation.
create or replace function public.current_academic_state()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('academic_year', academic_year, 'promoted_at', promotion_date)
       from promotion_log order by promotion_date desc limit 1),
    '{}'::jsonb)
$$;

revoke execute on function public.run_promotion(text) from public, anon;
revoke execute on function public.revert_promotion(text) from public, anon;
revoke execute on function public.current_academic_state() from public, anon;
grant execute on function public.run_promotion(text) to authenticated;
grant execute on function public.revert_promotion(text) to authenticated;
grant execute on function public.current_academic_state() to authenticated;

-- 6. Private archive bucket: graduates' complete records are saved here before
--    their accounts are removed. Only tier-1 staff can read it.
insert into storage.buckets (id, name, public)
values ('archives', 'archives', false)
on conflict (id) do nothing;

drop policy if exists archives_read on storage.objects;
create policy archives_read on storage.objects for select to authenticated
  using (bucket_id = 'archives' and public.is_hod());
