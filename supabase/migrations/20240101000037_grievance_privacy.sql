-- Grievances are private between the student and department leadership. Until now any
-- faculty account could read (and update) every grievance, including complaints about
-- that faculty member. The app only offers the Grievances page to students and tier 1.

drop policy if exists grievances_select on public.grievances;
create policy grievances_select on public.grievances for select to authenticated
  using (student_id = (select auth.uid()) or is_hod());

drop policy if exists grievances_update on public.grievances;
create policy grievances_update on public.grievances for update to authenticated
  using (is_hod()) with check (is_hod());

-- Helper from migration 34 that was left callable by signed-out visitors (harmless, but
-- the rule is: no function access without signing in). Checked by tests/db/06.
revoke execute on function public.name_words(text) from public, anon;
grant execute on function public.name_words(text) to authenticated, service_role;
