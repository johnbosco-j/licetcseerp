-- Faculty see an anonymous summary of the appraisals students submitted about
-- them: review count, averages per question and (from 3 reviews up, so no single
-- student can be identified) the written comments in random order. Individual
-- appraisal rows stay readable only by their author and tier 1.
create or replace function public.my_appraisal_summary(p_year int)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select body::jsonb as b
    from announcements
    where audience = 'APPRAISAL:faculty'
      and body like '{%'
      and (body::jsonb) ->> 'faculty_id' = auth.uid()::text
      and ((body::jsonb) ->> 'year') = p_year::text
  ), q as (
    select key, round(avg(value::numeric), 2) as v
    from r, jsonb_each_text(r.b -> 'ratings')
    where value ~ '^[0-9.]+$'
    group by key
  )
  select jsonb_build_object(
    'reviews', (select count(*) from r),
    'by_question', (select coalesce(jsonb_object_agg(key, v), '{}'::jsonb) from q),
    'comments', case when (select count(*) from r) >= 3 then
        (select coalesce(jsonb_agg(c order by random()), '[]'::jsonb)
           from (select nullif(trim(b ->> 'comment'), '') as c from r) x where c is not null)
      else '[]'::jsonb end
  )
$$;
revoke execute on function public.my_appraisal_summary(int) from public, anon;
grant execute on function public.my_appraisal_summary(int) to authenticated;
