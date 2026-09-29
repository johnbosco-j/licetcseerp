-- Findings from the Supabase security and performance advisors.

-- ── 1. Signed-out visitors get no database access at all ─────────────────────
-- The public homepage is static; every data request is made after sign-in. RLS
-- already returns nothing to the anon role, this removes the grants as well so
-- the tables and functions are not even discoverable (e.g. through GraphQL).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- ── 2. Fixed search_path on the two trigger functions that lacked one ────────
alter function public.audit_log_immutable() set search_path = public;
alter function public.compute_ledger_hash() set search_path = public, extensions;

-- ── 3. RLS: evaluate auth.uid() once per query instead of once per row ───────
do $$
declare
  p record;
  q text;
  c text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
  loop
    q := replace(p.qual, 'auth.uid()', '(select auth.uid())');
    c := replace(p.with_check, 'auth.uid()', '(select auth.uid())');
    if q is not null and c is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, q, c);
    elsif q is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
    else
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
    end if;
  end loop;
end $$;

-- ── 4. Indexes for foreign keys ──────────────────────────────────────────────
create index if not exists announcements_department_idx      on public.announcements (department_id);
create index if not exists attendance_faculty_idx            on public.attendance (faculty_id);
create index if not exists attendance_alerts_cleared_by_idx  on public.attendance_alerts (cleared_by);
create index if not exists day_attendance_marked_by_idx      on public.day_attendance (marked_by);
create index if not exists finance_ledger_created_by_idx     on public.finance_ledger (created_by);
create index if not exists grievances_assigned_to_idx        on public.grievances (assigned_to);
create index if not exists inventory_department_idx          on public.inventory (department_id);
create index if not exists leaves_reviewed_by_idx            on public.leaves (reviewed_by);
create index if not exists marks_faculty_idx                 on public.marks (faculty_id);
create index if not exists marks_subject_idx                 on public.marks (subject_id);
create index if not exists placement_offers_created_by_idx   on public.placement_offers (created_by);
create index if not exists placements_created_by_idx         on public.placements (created_by);
create index if not exists placements_department_idx         on public.placements (department_id);
create index if not exists profiles_department_idx           on public.profiles (department_id);
create index if not exists promotion_log_run_by_idx          on public.promotion_log (run_by);
create index if not exists promotion_history_student_idx     on public.student_promotion_history (student_id);
create index if not exists subject_locks_locked_by_idx       on public.subject_locks (locked_by);
create index if not exists subjects_department_idx           on public.subjects (department_id);

-- ── 5. Functions: callable by signed-in users only ───────────────────────────
-- New functions are executable by PUBLIC (which includes anon) by default.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public;
