-- Term lifecycle: only the HOD starts a term; periods carry over; exactly one current term.
begin;
create temp table r (n serial, ok boolean, test text, info text);
grant all on r to authenticated; grant usage on sequence r_n_seq to authenticated;
do $$
declare
  dept uuid := (select id from departments limit 1);
  hod uuid := gen_random_uuid(); fa uuid := gen_random_uuid();
  cur uuid := current_term_id(); t uuid; n int; msg text;
begin
  insert into auth.users (id, email, aud, role) values (hod, 'h2@example.test', 'authenticated', 'authenticated'), (fa, 'f2@example.test', 'authenticated', 'authenticated');
  insert into profiles (id, role, department_id, full_name, email, is_active) values (hod, 'HOD', dept, 'T HOD', 'h2@example.test', true), (fa, 'PROFESSOR', dept, 'T Fac', 'f2@example.test', true);
  perform set_config('request.jwt.claims', json_build_object('sub', fa, 'role', 'authenticated')::text, true);
  begin perform start_term('2099-2100', 'EVEN', null, null); insert into r(ok, test, info) values (false, 'faculty cannot start a term', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'faculty cannot start a term', 'refused'); end;
  perform set_config('request.jwt.claims', json_build_object('sub', hod, 'role', 'authenticated')::text, true);
  begin perform start_term('2099-2101', 'EVEN', null, null); insert into r(ok, test, info) values (false, 'bad academic year rejected', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'bad academic year rejected', 'refused'); end;
  begin perform start_term('2099-2100', 'EVEN', '2100-05-01', '2100-01-01'); insert into r(ok, test, info) values (false, 'end before start rejected', 'allowed');
  exception when others then insert into r(ok, test, info) values (true, 'end before start rejected', 'refused'); end;
  t := start_term('2099-2100', 'EVEN', '2100-01-05', '2100-05-30');
  insert into r(ok, test, info) values (current_term_id() = t and (select count(*) from academic_terms where is_current) = 1, 'new term becomes the only current term', 'ok');
  select count(*) into n from period_slots where term_id = t;
  insert into r(ok, test, info) values (n = (select count(*) from period_slots where term_id = cur), 'period timings carried over', n || ' periods');
  insert into r(ok, test, info) values ((current_academic_state()->>'term_parity') = 'EVEN', 'sign-in state reports the new term', current_academic_state()->>'term_label');
  insert into r(ok, test, info) values (start_term('2099-2100', 'EVEN', null, null) = t, 'starting the same term again reuses it', 'ok');
  perform set_config('request.jwt.claims', '', true);
end $$;
select ok, test, info from r order by n;
rollback;
