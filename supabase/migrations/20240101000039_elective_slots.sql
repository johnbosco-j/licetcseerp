-- Elective slots: courses that are alternatives for the same hours share a slot
-- (PE1 = POPL for Full Stack / RL for AI & ML, PE2 = UI/UX / NN&DL, Honours, …).
-- Pages show "PE1 · POPL" and each student sees the option of their own vertical.

alter table public.subjects add column if not exists elective_slot text
  check (elective_slot is null or length(trim(elective_slot)) between 1 and 20);

-- 2026-27 odd term, III year (batch 2024-28) professional electives, and the IV year honours
update public.subjects set elective_slot = 'PE1' where code in ('PCS2416', 'PCS2444') and section is null and elective_slot is null;
update public.subjects set elective_slot = 'PE2' where code in ('PCS2412', 'PCS2442') and section is null and elective_slot is null;
update public.subjects set elective_slot = 'Honours' where code in ('CCS334', 'CCS349') and section is null and elective_slot is null;
