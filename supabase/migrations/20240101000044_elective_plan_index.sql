-- Index for the elective plan's vertical foreign key (Supabase performance advisor).
create index if not exists elective_plan_vertical on public.elective_plan (vertical);
