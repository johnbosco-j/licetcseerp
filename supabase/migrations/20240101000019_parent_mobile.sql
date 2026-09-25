-- Parent / guardian mobile number for students (10 digits, no country code).
-- Visibility follows profiles RLS: the student themself and staff can read it;
-- only tier-1 staff (HOD / Vice Principal) can change it.
alter table public.profiles
  add column if not exists parent_mobile text
  check (parent_mobile is null or parent_mobile ~ '^[0-9]{10}$');

comment on column public.profiles.parent_mobile is 'Parent / guardian mobile number, 10 digits without the +91 country code';
