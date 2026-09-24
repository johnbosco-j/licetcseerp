-- ── CSE Department ─────────────────────────────────────────────────────────
-- The whole app scopes data to this fixed department id.
INSERT INTO departments (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Computer Science & Engineering', 'CSE')
ON CONFLICT (id) DO NOTHING;

-- Staff and student accounts are created by `npm run seed` (scripts/seed-users.mjs),
-- which uses the Supabase Admin API. Inserting straight into auth.users from SQL
-- skips auth.identities and leaves token columns NULL, which makes GoTrue reject
-- those logins on hosted Supabase.
