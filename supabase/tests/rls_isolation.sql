-- RLS isolation check. Run as the postgres role; everything is rolled back.
-- Two freelancers each own a deal. Each must see only their own deal and milestones,
-- writes from the authenticated role must be blocked, and the role is fixed once set.
begin;

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@test.local', 'authenticated', 'authenticated');

insert into public.deals (id, freelancer_id, client_name, currency, total_minor)
values
  ('00000000-0000-4000-8000-0000000000da', '00000000-0000-4000-8000-00000000000a', 'Client A', 'USD', 40000),
  ('00000000-0000-4000-8000-0000000000db', '00000000-0000-4000-8000-00000000000b', 'Client B', 'GBP', 30000);
insert into public.milestones (deal_id, position, title, amount_minor)
values
  ('00000000-0000-4000-8000-0000000000da', 0, 'A1', 40000),
  ('00000000-0000-4000-8000-0000000000db', 0, 'B1', 30000);

create temp table rls_results (check_name text, passed boolean) on commit drop;
grant insert, select on rls_results to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';

insert into rls_results values
  ('A sees exactly 1 deal', (select count(*) = 1 from public.deals)),
  ('A sees own deal', exists (select 1 from public.deals where client_name = 'Client A')),
  ('A cannot see B deal', not exists (select 1 from public.deals where id = '00000000-0000-4000-8000-0000000000db')),
  ('A sees only own milestones', (select array_agg(title) = array['A1'] from public.milestones)),
  ('A sees only own profile', (select count(*) = 1 from public.profiles));

-- Writes outside the own profile are refused.
do $$ begin
  update public.deals set title = 'hacked' where id = '00000000-0000-4000-8000-0000000000db';
  insert into rls_results values ('A cannot update deals', false);
exception when insufficient_privilege then
  insert into rls_results values ('A cannot update deals', true);
end $$;

-- Role can be set once, then never changed.
update public.profiles set role = 'freelancer', full_name = 'Test A' where id = auth.uid();
do $$ begin
  update public.profiles set role = 'client' where id = auth.uid();
  insert into rls_results values ('role is fixed once set', false);
exception when raise_exception then
  insert into rls_results values ('role is fixed once set', true);
end $$;

-- Updating someone else's profile silently matches 0 rows.
update public.profiles set full_name = 'x' where id = '00000000-0000-4000-8000-00000000000b';

reset role;
insert into rls_results values
  ('B profile untouched', (select full_name is null from public.profiles where id = '00000000-0000-4000-8000-00000000000b')),
  ('profile auto-created on signup', (select count(*) = 2 from public.profiles where id::text like '00000000-0000-4000-8000-00000000000%'));

select check_name, passed from rls_results;
rollback;
