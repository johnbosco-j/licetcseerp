-- A student's class timetable is the current term's; past terms show only their own courses
-- (last year the same section name belonged to another batch).
drop policy if exists timetable_entries_read on public.timetable_entries;
create policy timetable_entries_read on public.timetable_entries for select to authenticated
  using (is_staff() or is_lab_staff()
         or (term_id = current_term_id() and exists (select 1 from profiles me where me.id = auth.uid() and me.role = 'STUDENT' and me.section = timetable_entries.section))
         or (subject_id is not null and student_sees_subject(subject_id)));
