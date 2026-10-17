-- Elective plan: for each batch, which course each vertical takes in each professional
-- elective slot (PE1–PE6, R2024: PE1/PE2 in semester 5, PE3/PE4 in 6, PE5/PE6 in 7).
-- The HOD edits it in Configuration → Verticals & groups; "Create this term's elective
-- courses" turns the slots of the current semester into combined offerings.
create table if not exists public.elective_plan (
  cohort_grad_year int  not null check (cohort_grad_year between 2020 and 2100),
  slot             text not null check (slot ~ '^PE[1-9]$'),
  vertical         text not null references public.verticals(code) on update cascade on delete cascade,
  course_code      text not null check (course_code ~ '^[A-Z]{2,4}[0-9]{4,5}$'),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  primary key (cohort_grad_year, slot, vertical)
);
create index if not exists elective_plan_updated_by on public.elective_plan (updated_by);
alter table public.elective_plan enable row level security;
drop policy if exists eplan_read on public.elective_plan;
create policy eplan_read on public.elective_plan for select to authenticated using (true);
drop policy if exists eplan_ins on public.elective_plan;
create policy eplan_ins on public.elective_plan for insert to authenticated with check (is_hod());
drop policy if exists eplan_upd on public.elective_plan;
create policy eplan_upd on public.elective_plan for update to authenticated using (is_hod()) with check (is_hod());
drop policy if exists eplan_del on public.elective_plan;
create policy eplan_del on public.elective_plan for delete to authenticated using (is_hod());
drop trigger if exists audit_elective_plan on public.elective_plan;
create trigger audit_elective_plan after insert or update or delete on public.elective_plan for each row execute function public.audit_row();

-- the other R2024 verticals, off until the department offers them
insert into public.verticals (code, name, course_codes, is_active) values
  ('DS', 'Data Science', array['PCS2401','PCS2402','PCS2403','PCS2404','PCS2405','PCS2406','PCS2407','PCS2408'], false),
  ('DCT', 'Data Center Technologies', array['PCS2417','PCS2418','PCS2419','PCS2420','PCS2421','PCS2422','PCS2424'], false),
  ('CYBER', 'Cyber Security and Data Privacy', array['PCS2425','PCS2426','PCS2427','PCS2428','PCS2429','PCS2420','PCS2430','PCS2431'], false),
  ('EMERGING', 'Emerging Technologies', array['PCS2432','PCS2433','PCS2434','PCS2435','PCS2436','PCS2437','PCS2438','PCS2439'], false)
on conflict (code) do nothing;
