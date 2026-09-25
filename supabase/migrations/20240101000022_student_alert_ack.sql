-- Students confirm on their own alert that they have met the HOD. Only the
-- met_hod flag of the caller's own, still-open alert can change; clearing an
-- alert stays with staff.
create or replace function public.acknowledge_alert(p_alert uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update attendance_alerts
     set met_hod = true, met_hod_at = now()
   where id = p_alert
     and student_id = auth.uid()
     and cleared_at is null
     and not coalesce(met_hod, false);
  if not found then
    raise exception 'Alert not found or already acknowledged';
  end if;
end $$;
revoke execute on function public.acknowledge_alert(uuid) from public, anon;
grant execute on function public.acknowledge_alert(uuid) to authenticated;
