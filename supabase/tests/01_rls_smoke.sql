-- RLS smoke test. Run after the migrations on a scratch database:
--   psql -d dl_test -v ON_ERROR_STOP=1 -f supabase/tests/01_rls_smoke.sql
-- Fails loudly (raise exception) if any isolation rule is broken.

\set ON_ERROR_STOP on
begin;

-- Two walkers, one client each, one dog each, a client login for walker A's client.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.test', '{"role":"walker","full_name":"Walker A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.test', '{"role":"walker","full_name":"Walker B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.test', '{"role":"client","full_name":"Client of A"}'),
  ('00000000-0000-0000-0000-00000000000e', 'op@x.test', '{"role":"operator","full_name":"Robert"}');

insert into walkers (id, handle) values
  ('00000000-0000-0000-0000-00000000000a', 'walker-a'),
  ('00000000-0000-0000-0000-00000000000b', 'walker-b');

insert into clients (id, walker_id, profile_id, name, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'Dexter''s owner', 'active'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', null, 'Someone else', 'active');

insert into dogs (id, client_id, walker_id, name, working_on) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Dexter', 'wait and stay'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'Anubis', 'recall');

-- Walker A rates their client; client rates walker A.
insert into ratings (walker_id, client_id, target, rater_profile_id, score) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'client', '00000000-0000-0000-0000-00000000000a', 4),
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'walker', '00000000-0000-0000-0000-00000000000c', 5);

-- Helper: run checks as a given user.
create or replace function _as(u uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, true);
$$;

set local role authenticated;

-- Walker A sees only their own dog.
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(*) from dogs) <> 1 then raise exception 'Walker A should see exactly 1 dog'; end if;
  if (select name from dogs) <> 'Dexter' then raise exception 'Walker A sees the wrong dog'; end if;
  if (select count(*) from clients) <> 1 then raise exception 'Walker A should see 1 client'; end if;
  if (select count(*) from ratings) <> 2 then raise exception 'Walker A should see both ratings involving them'; end if;
end $$;

-- Walker B cannot touch Walker A's dog.
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from dogs where name = 'Dexter') then raise exception 'Walker B can see Walker A''s dog'; end if;
  update dogs set name = 'Hacked' where id = '20000000-0000-0000-0000-000000000001';
  if exists (select 1 from dogs where name = 'Hacked') then raise exception 'Walker B updated another walker''s dog'; end if;
end $$;

-- Client sees own dog, the rating they gave, and never the rating about them.
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from dogs) <> 1 then raise exception 'Client should see exactly their dog'; end if;
  if (select count(*) from ratings) <> 1 then raise exception 'Client should see exactly one rating'; end if;
  if (select target from ratings) <> 'walker' then raise exception 'Client can see a rating about themselves'; end if;
  if exists (select 1 from clients where name = 'Someone else') then raise exception 'Client sees another walker''s client'; end if;
end $$;

-- Client can drop an anonymous suggestion; it stores no client id.
insert into suggestions (walker_id, body) values ('00000000-0000-0000-0000-00000000000a', 'More rainy day trails please');

-- Operator sees everything.
select _as('00000000-0000-0000-0000-00000000000e');
do $$ begin
  if (select count(*) from dogs) <> 2 then raise exception 'Operator should see all dogs'; end if;
  if (select count(*) from suggestions) <> 1 then raise exception 'Operator should see suggestions'; end if;
end $$;

reset role;
select 'RLS smoke test passed' as result;
rollback;
