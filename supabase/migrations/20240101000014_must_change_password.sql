-- Accounts with a known/default password must choose a new one at next sign-in.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Profiles are HOD-write only, so users clear their own flag through this
-- function after changing their password on the Change Password page.
CREATE OR REPLACE FUNCTION public.password_changed() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE profiles SET must_change_password = false WHERE id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.password_changed() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.password_changed() TO authenticated;
