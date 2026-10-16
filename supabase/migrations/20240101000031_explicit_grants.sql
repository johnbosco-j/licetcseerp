-- Explicit table privileges. Older Supabase projects granted every table to the
-- API roles automatically; newer Supabase (and a self-hosted install) do not, so a
-- fresh database built from these migrations would refuse every signed-in request.
-- Row level security still decides which rows each person can see or change.
-- Signed-out (anon) access stays revoked (migration 25).

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Signed-in users never need these (TRUNCATE would bypass row level security).
revoke truncate, trigger, references on all tables in schema public from authenticated;

alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
