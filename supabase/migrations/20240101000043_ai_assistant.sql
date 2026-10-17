-- In-app AI assistant: on/off and a daily limit per person (Configuration → Attendance rules),
-- and the per-day request count. The assistant only reads through the person's own session,
-- so row level security decides what it can see.
create table if not exists public.ai_usage (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  day      date not null default ist_today(),
  requests int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage for select to authenticated using (user_id = (select auth.uid()) or is_hod());

insert into public.app_settings (key, value) values ('ai.enabled', 'true'), ('ai.daily_limit', '40')
on conflict (key) do nothing;

-- counts one request; false when switched off or over today's limit
create or replace function public.ai_take_quota()
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or setting_text('ai.enabled', 'true') = 'false' then return false; end if;
  insert into ai_usage (user_id, day, requests) values (auth.uid(), ist_today(), 1)
  on conflict (user_id, day) do update set requests = ai_usage.requests + 1
  returning requests into n;
  return n <= setting_int('ai.daily_limit', 40);
end $$;
revoke execute on function public.ai_take_quota() from public, anon;
grant execute on function public.ai_take_quota() to authenticated;
