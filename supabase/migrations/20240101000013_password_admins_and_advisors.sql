-- Class advisors and password-reset delegation.
--   advisor_section      — the section a faculty member is class advisor for;
--                          they may reset passwords of students in it.
--   can_reset_passwords  — may reset any student or faculty password.
-- Only the HOD can change these (profiles_update is HOD-only).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS advisor_section     TEXT,
  ADD COLUMN IF NOT EXISTS can_reset_passwords BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_one_advisor_per_section
  ON profiles(advisor_section) WHERE advisor_section IS NOT NULL;

UPDATE profiles SET can_reset_passwords = true WHERE email = 'reme@licet.ac.in';
