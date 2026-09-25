-- profiles.batch_year means the student's graduating year (e.g. 2028 for the
-- 2024-28 batch, matching the "28csa" in their email). Early imports stored the
-- year of study (1-4) instead, which goes stale after every promotion. Convert
-- those to the graduating year from the student's current section.
update public.profiles p
   set batch_year = ay.start_year + case split_part(p.section, ' ', 1)
                                      when 'IV' then 1 when 'III' then 2 when 'II' then 3 when 'I' then 4 end
  from (select case when extract(month from now()) >= 6 then extract(year from now())::int
                    else extract(year from now())::int - 1 end as start_year) ay
 where p.role = 'STUDENT'
   and p.batch_year between 1 and 4
   and split_part(p.section, ' ', 1) in ('I', 'II', 'III', 'IV');

comment on column public.profiles.batch_year is 'Graduating year of the student''s batch, e.g. 2028';
