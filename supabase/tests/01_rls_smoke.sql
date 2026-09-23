-- RLS smoke test. Run after the migrations on a scratch database:
--   psql -d dl_test -v ON_ERROR_STOP=1 -f supabase/tests/01_rls_smoke.sql
-- Fails loudly (raise exception) if any isolation rule is broken.

\set ON_ERROR_STOP on
begin;

-- Two walkers, one client each, one dog each, a client login for walker A's client.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.test', '{"role":"walker","full_name":"Walker A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.test', '{"role":"walker","full_name":"Walker B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.test', '{"role":"client","full_name":"Client of A"}');
-- The operator is made with the service role (app_metadata). Signing up with
-- role "operator" in user_metadata just makes a walker.
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000e', 'op@x.test', '{"full_name":"Robert"}', '{"role":"operator"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'sneaky@x.test', '{"role":"operator","full_name":"Sneaky"}', '{}');
do $$ begin
  if (select role from profiles where id = '00000000-0000-0000-0000-00000000000e') <> 'operator' then
    raise exception 'Operator from app_metadata did not get the operator role';
  end if;
  if (select role from profiles where id = '00000000-0000-0000-0000-0000000000f1') <> 'walker' then
    raise exception 'Signup picked the operator role through user_metadata';
  end if;
end $$;

insert into walkers (id, handle) values
  ('00000000-0000-0000-0000-00000000000a', 'walker-a'),
  ('00000000-0000-0000-0000-00000000000b', 'walker-b');

insert into clients (id, walker_id, profile_id, name, status) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c', 'Dexter''s owner', 'active'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', null, 'Someone else', 'active');

insert into dogs (id, client_id, walker_id, name, working_on) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Dexter', 'wait and stay'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'Anubis', 'recall');

-- Private details that must never leak onto the public profile.
update profiles set phone = '555-PRIVATE' where id = '00000000-0000-0000-0000-00000000000a';
update walkers set bio = 'Trail walks in the hills', background_check_path = '00000000-0000-0000-0000-00000000000a/secret-proof.pdf'
  where id = '00000000-0000-0000-0000-00000000000a';
update clients set address_line = '1 Secret Lane', home_access_notes = 'Key under the mat', email = 'owner@x.test'
  where id = '10000000-0000-0000-0000-000000000001';
insert into walker_services (walker_id, service_type_id, rate_cents, duration_min)
  select '00000000-0000-0000-0000-00000000000a', id, 2500, 60 from service_types where key = 'group_walk';

-- A finished walk with Dexter, so the client can rate and tip it.
insert into walks (id, walker_id, service_type_id, status, started_at, ended_at)
  select '30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', id, 'done', now() - interval '1 hour', now()
  from service_types where key = 'group_walk';
insert into walk_dogs (walk_id, dog_id) values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
-- A photo of Dexter, and one of Walker B's dog, as stored files plus rows.
insert into storage.buckets (id, name, public) values ('photos', 'photos', false) on conflict do nothing;
insert into storage.objects (bucket_id, name) values
  ('photos', '00000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-000000000001/dexter.jpg'),
  ('photos', '00000000-0000-0000-0000-00000000000b/misc/anubis.jpg');
insert into photos (walker_id, walk_id, dog_id, storage_path) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000000a/30000000-0000-0000-0000-000000000001/dexter.jpg'),
  ('00000000-0000-0000-0000-00000000000b', null, '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b/misc/anubis.jpg');
insert into messages (walker_id, client_id, sender_id, kind, body) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'custom', 'Original text');

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

-- Client can open their dog's photo file, and not another walker's.
do $$ begin
  if (select count(*) from storage.objects where bucket_id = 'photos') <> 1 then
    raise exception 'Client should see exactly their dog''s photo file, saw %', (select count(*) from storage.objects where bucket_id = 'photos');
  end if;
  if exists (select 1 from storage.objects where name like '%anubis%') then raise exception 'Client can open another walker''s photo'; end if;
end $$;

-- Client never sees a rating about themselves, however they ask for it.
do $$ begin
  if exists (select 1 from ratings where target = 'client') then raise exception 'Client can read a rating about themselves'; end if;
  if exists (select 1 from ratings where client_id = '10000000-0000-0000-0000-000000000001' and rater_profile_id = '00000000-0000-0000-0000-00000000000a')
    then raise exception 'Client can read the walker''s rating of them'; end if;
end $$;

-- Client can drop an anonymous suggestion; it stores no client id.
insert into suggestions (walker_id, body) values ('00000000-0000-0000-0000-00000000000a', 'More rainy day trails please');
do $$ begin
  -- An "anonymous" suggestion that names the sender is rejected outright.
  begin
    insert into suggestions (walker_id, body, is_anonymous, client_id)
      values ('00000000-0000-0000-0000-00000000000a', 'Sneaky', true, '10000000-0000-0000-0000-000000000001');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Anonymous suggestion stored a client id'; end if;
  end;
  -- A signed one can't claim to be another walker's client.
  begin
    insert into suggestions (walker_id, body, is_anonymous, client_id)
      values ('00000000-0000-0000-0000-00000000000a', 'Imposter', false, '10000000-0000-0000-0000-000000000002');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Signed suggestion accepted someone else''s client id'; end if;
  end;
end $$;

-- Client rates the finished walk once; a second rating is refused.
insert into ratings (walker_id, client_id, target, rater_profile_id, walk_id, score)
  values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'walker',
          '00000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-000000000001', 5);
do $$ begin
  begin
    insert into ratings (walker_id, client_id, target, rater_profile_id, walk_id, score)
      values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'walker',
              '00000000-0000-0000-0000-00000000000c', '30000000-0000-0000-0000-000000000001', 1);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client rated the same walk twice'; end if;
  end;
  begin
    insert into ratings (walker_id, client_id, target, rater_profile_id, score)
      values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'client',
              '00000000-0000-0000-0000-00000000000c', 1);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client wrote a rating about a client'; end if;
  end;
end $$;

-- Tip on the finished walk is forced to pending and can't be marked paid.
insert into tips (walker_id, client_id, walk_id, amount_cents, status)
  values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 500, 'paid');
do $$ begin
  if (select status from tips) <> 'pending' then raise exception 'Client created a tip that isn''t pending'; end if;
  begin
    update tips set status = 'paid';
  exception when others then null;  -- refused outright is fine too
  end;
  if (select status from tips) <> 'pending' then raise exception 'Client marked their tip paid'; end if;
end $$;

-- Column guards: no self-promotion, no editing the walker's words, no moving to another walker.
do $$ begin
  begin
    update profiles set role = 'operator' where id = '00000000-0000-0000-0000-00000000000c';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client made themselves operator'; end if;
  end;
  begin
    update messages set body = 'Edited by client';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client edited the walker''s message'; end if;
  end;
  update messages set read_at = now();
  if (select count(*) from messages where read_at is null) > 0 then raise exception 'Client could not mark a message read'; end if;
  begin
    update clients set walker_id = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client moved themselves to another walker'; end if;
  end;
end $$;

-- Walker A can't verify their own background check.
select _as('00000000-0000-0000-0000-00000000000a');
update walkers set background_check_verified_at = now(), status = 'active' where id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select background_check_verified_at from walkers where id = '00000000-0000-0000-0000-00000000000a') is not null
    then raise exception 'Walker verified their own background check'; end if;
  -- Walker reads the anonymous suggestion with no sender attached.
  if (select count(*) from suggestions where client_id is null and is_anonymous) <> 1 then raise exception 'Anonymous suggestion missing or signed'; end if;
end $$;

-- Logged out: the public profile has the public bits and nothing private.
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare
  p jsonb := public_walker_profile('walker-a');
  t text := p::text;
begin
  if p is null then raise exception 'Public profile missing'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(p) k) <> array['avatar_url','background_checked','bio','business_name','full_name',
      'handle','rating_avg','rating_count','service_area','services'] then
    raise exception 'Public profile has unexpected fields: %', (select array_agg(k) from jsonb_object_keys(p) k);
  end if;
  if (p->>'rating_count')::int <> 2 or jsonb_array_length(p->'services') <> 1 or (p->'services'->0->>'rate_cents')::int <> 2500 then
    raise exception 'Public profile rating or services wrong: %', p;
  end if;
  if t ilike any (array['%555-PRIVATE%', '%secret-proof%', '%Secret Lane%', '%Key under%', '%owner@x.test%', '%Dexter%', '%a@x.test%'])
    then raise exception 'Public profile leaks private data: %', t; end if;
  if exists (select 1 from walkers) or exists (select 1 from clients) or exists (select 1 from dogs) or exists (select 1 from profiles)
    then raise exception 'Logged-out visitor can read private tables'; end if;
end $$;
set local role authenticated;

-- Operator sees everything.
select _as('00000000-0000-0000-0000-00000000000e');
do $$ begin
  if (select count(*) from dogs) <> 2 then raise exception 'Operator should see all dogs'; end if;
  if (select count(*) from suggestions) <> 1 then raise exception 'Operator should see suggestions'; end if;
end $$;

-- ===========================================================================
-- Stage 6: coverage squad. A and B are squad; D is not. Client C (of A) has
-- Dexter (on the booking) and Pip (not on it), and home access notes.
-- ===========================================================================
reset role;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000d', 'd@x.test', '{"role":"walker","full_name":"Walker D"}');
insert into walkers (id, handle) values ('00000000-0000-0000-0000-00000000000d', 'walker-d');
insert into squad_links (requester_id, recipient_id, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'accepted');
insert into dogs (id, client_id, walker_id, name) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Pip');
insert into bookings (id, walker_id, client_id, service_type_id, starts_at)
  select '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', id, now()
  from service_types where key = 'group_walk';
insert into booking_dogs (booking_id, dog_id) values ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
-- Helper: what can the current walker see of client C?
create or replace function _sees_client_c() returns text language sql as $$
  select concat_ws(',',
    (select 'client' from clients where id = '10000000-0000-0000-0000-000000000001'),
    (select 'notes:' || home_access_notes from clients where id = '10000000-0000-0000-0000-000000000001'),
    (select string_agg(name, '+' order by name) from dogs where client_id = '10000000-0000-0000-0000-000000000001'));
$$;
set local role authenticated;


-- B is squad but not approved: nothing. D is not squad: nothing. A can't ask B yet.
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if _sees_client_c() <> '' then raise exception 'Unapproved squad member sees client C: %', _sees_client_c(); end if;
  if (select count(*) from squad_overview() where status = 'accepted') <> 1 then raise exception 'B should see A in their squad'; end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if _sees_client_c() <> '' then raise exception 'Non-squad walker sees client C'; end if;
  if (select count(*) from squad_overview()) <> 0 then raise exception 'Non-squad walker sees a squad'; end if;
  if (select count(*) from find_walker_by_handle('walker-a')) <> 1 then raise exception 'Exact handle lookup failed'; end if;
  if (select count(*) from find_walker_by_handle('walker')) <> 0 then raise exception 'Handle lookup matched a partial handle'; end if;
  -- D can't slip Dexter onto their own walk.
  insert into walks (id, walker_id, service_type_id, status)
    select '30000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000d', id, 'in_progress' from service_types where key = 'group_walk';
  begin
    insert into walk_dogs (walk_id, dog_id) values ('30000000-0000-0000-0000-00000000000d', '20000000-0000-0000-0000-000000000001');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Non-squad walker put another walker''s dog on their walk'; end if;
  end;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    insert into coverage_requests (booking_id, from_walker_id, to_walker_id, occurs_on, starts_at)
      values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', current_date, now());
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Coverage requested from a walker the client never approved'; end if;
  end;
end $$;

-- Client approves B (and can't approve D, who isn't in A's squad). A's client list is private to D.
select _as('00000000-0000-0000-0000-00000000000c');
insert into coverage_approvals (client_id, coverage_walker_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    insert into coverage_approvals (client_id, coverage_walker_id) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client approved a walker outside their walker''s squad'; end if;
  end;
  if (select count(*) from client_squad_choices() where approved) <> 1 then raise exception 'Client should see B as approved'; end if;
end $$;

-- Approved but no accepted cover yet: still nothing.
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if _sees_client_c() <> '' then raise exception 'Approved squad member sees client C with no cover'; end if;
end $$;

-- A asks B for a day 10 days out and for today.
select _as('00000000-0000-0000-0000-00000000000a');
insert into coverage_requests (id, booking_id, from_walker_id, to_walker_id, occurs_on, starts_at, tz) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000b', current_date + 10, now() + interval '10 days', 'America/Los_Angeles'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000b', current_date, now(), 'America/Los_Angeles');
do $$ begin
  -- A can't accept their own request.
  begin
    update coverage_requests set status = 'accepted' where id = '50000000-0000-0000-0000-000000000002';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Requester accepted their own coverage request'; end if;
  end;
  -- The window is computed by the database: midnight the day before → midnight after (LA).
  if (select access_until - access_from from coverage_requests where id = '50000000-0000-0000-0000-000000000002') not in (interval '48 hours', interval '47 hours', interval '49 hours')
    then raise exception 'Coverage window isn''t two days'; end if;
end $$;

-- B accepts the far-off day: still nothing (outside the window).
select _as('00000000-0000-0000-0000-00000000000b');
update coverage_requests set status = 'accepted' where id = '50000000-0000-0000-0000-000000000001';
do $$ begin
  if (select status from coverage_requests where id = '50000000-0000-0000-0000-000000000001') <> 'accepted' then raise exception 'B could not accept'; end if;
  if _sees_client_c() <> '' then raise exception 'Covering walker sees client C outside the window: %', _sees_client_c(); end if;
end $$;

-- B accepts today: sees client C's home notes and Dexter only (not Pip, who isn't on the booking).
update coverage_requests set status = 'accepted' where id = '50000000-0000-0000-0000-000000000002';
do $$ begin
  if _sees_client_c() <> 'client,notes:Key under the mat,Dexter' then
    raise exception 'Covering walker in window should see client, notes and Dexter only, saw: %', _sees_client_c();
  end if;
  -- D still sees nothing.
end $$;
select _as('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if _sees_client_c() <> '' then raise exception 'Non-squad walker sees client C during someone else''s cover'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Billing (0013), while B is covering client C right now
-- ---------------------------------------------------------------------------
-- A bills own client C: a draft and a sent invoice. A can't invoice B's client.
select _as('00000000-0000-0000-0000-00000000000a');
insert into invoices (id, walker_id, client_id, period_start, period_end) values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', current_date - 7, current_date),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', current_date - 7, current_date);
insert into invoice_lines (walker_id, client_id, invoice_id, kind, description, occurred_on, unit_cents) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 'extra', 'Key pickup', current_date, 500);
update invoices set status = 'sent' where id = '60000000-0000-0000-0000-000000000002';
insert into payments (walker_id, client_id, invoice_id, amount_cents, method) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 200, 'venmo');
do $$ begin
  if (select number from invoices where id = '60000000-0000-0000-0000-000000000002') <> 2 then raise exception 'Invoice numbers should count up per walker'; end if;
  if (select due_on from invoices where id = '60000000-0000-0000-0000-000000000002') <> current_date + 7 then raise exception 'Due date should be net 7'; end if;
  begin
    insert into invoices (walker_id, client_id, period_start, period_end)
      values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', current_date, current_date);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Walker invoiced another walker''s client'; end if;
  end;
  begin
    update invoice_lines set unit_cents = 1 where invoice_id = '60000000-0000-0000-0000-000000000002';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Walker edited a line on a sent invoice'; end if;
  end;
end $$;

-- B (covering C right now, sees C's home notes) sees none of C's invoices, lines or payments.
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if _sees_client_c() = '' then raise exception 'Setup: B should be covering C right now'; end if;
  if exists (select 1 from invoices) or exists (select 1 from invoice_lines) or exists (select 1 from payments) then
    raise exception 'Covering walker can see the client''s billing';
  end if;
end $$;

-- B walks Dexter on the cover: the walk bills through A, the regular walker.
insert into walks (id, walker_id, service_type_id, status, started_at)
  select '30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', id, 'in_progress', now()
  from service_types where key = 'group_walk';
insert into walk_dogs (walk_id, dog_id) values ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-000000000001');
update walks set status = 'done', ended_at = now() where id = '30000000-0000-0000-0000-0000000000b1';
do $$ begin
  if exists (select 1 from invoice_lines) then raise exception 'Covering walker got a billing line for someone else''s client'; end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select walker_id from invoice_lines where walk_id = '30000000-0000-0000-0000-0000000000b1') <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'Covered walk should bill through the regular walker';
  end if;
end $$;

-- The client sees only their own sent invoice (not the draft), with its line and payment.
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from invoices) <> 1 or (select status from invoices) <> 'sent' then raise exception 'Client should see exactly their sent invoice'; end if;
  if (select count(*) from invoice_lines) <> 1 or (select count(*) from payments) <> 1 then raise exception 'Client should see that invoice''s line and payment'; end if;
  begin
    insert into payments (walker_id, client_id, invoice_id, amount_cents, method) values
      ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', 9999, 'cash');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client recorded a payment on their own invoice'; end if;
  end;
end $$;
-- D (no relationship) sees no billing at all.
select _as('00000000-0000-0000-0000-00000000000d');
do $$ begin
  if exists (select 1 from invoices) or exists (select 1 from invoice_lines) or exists (select 1 from payments) then
    raise exception 'Unrelated walker sees billing';
  end if;
end $$;

-- Push subscriptions and notifications are private.
select _as('00000000-0000-0000-0000-00000000000a');
insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000a', 'https://push.example/a', 'k', 'a');
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from push_subscriptions) then raise exception 'Walker B can see walker A''s push subscription'; end if;
  begin
    insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000a', 'https://push.example/b', 'k', 'a');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Walker B subscribed on A''s behalf'; end if;
  end;
end $$;

-- Only the operator verifies background checks or suspends walkers.
select _as('00000000-0000-0000-0000-00000000000a');
update walkers set background_check_verified_at = now(), status = 'active' where id = '00000000-0000-0000-0000-00000000000a';
update walkers set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select background_check_verified_at from walkers where id = '00000000-0000-0000-0000-00000000000a') is not null then
    raise exception 'Walker verified their own background check';
  end if;
end $$;
reset role;
do $$ begin
  if (select status from walkers where id = '00000000-0000-0000-0000-00000000000b') <> 'active' then raise exception 'Walker A suspended walker B'; end if;
end $$;
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000e');
update walkers set background_check_verified_at = now() where id = '00000000-0000-0000-0000-00000000000a';
update walkers set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000b';
reset role;
do $$ begin
  if (select background_check_verified_at from walkers where id = '00000000-0000-0000-0000-00000000000a') is null then raise exception 'Operator could not verify'; end if;
  if (select status from walkers where id = '00000000-0000-0000-0000-00000000000b') <> 'suspended' then raise exception 'Operator could not suspend'; end if;
end $$;
update walkers set status = 'active' where id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;

-- The client got an in-app notice for each acceptance.
reset role;
do $$ begin
  if (select count(*) from messages where body like 'Walker B is covering Dexter''s walk on %') <> 2 then
    raise exception 'Client notice missing: %', (select string_agg(body, ' | ') from messages);
  end if;
end $$;

-- After the window closes, access is gone. (Admin step: no user identity.)
select set_config('request.jwt.claim.sub', '', true);
update coverage_requests set access_from = now() - interval '3 days', access_until = now() - interval '1 minute'
  where id = '50000000-0000-0000-0000-000000000002';
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if _sees_client_c() <> '' then raise exception 'Covering walker still sees client C after the window: %', _sees_client_c(); end if;
end $$;

-- Revoking the approval cancels B's upcoming accepted cover.
select _as('00000000-0000-0000-0000-00000000000c');
update coverage_approvals set revoked_at = now() where coverage_walker_id = '00000000-0000-0000-0000-00000000000b';
reset role;
do $$ begin
  if (select status from coverage_requests where id = '50000000-0000-0000-0000-000000000001') <> 'cancelled' then
    raise exception 'Revoking approval left an upcoming cover in place';
  end if;
end $$;
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Voiding a sent invoice (0016)
-- ---------------------------------------------------------------------------
-- A puts B's covered walk (unbilled) on draft #1 and sends it, then voids it.
select _as('00000000-0000-0000-0000-00000000000a');
update invoice_lines set invoice_id = '60000000-0000-0000-0000-000000000001' where walk_id = '30000000-0000-0000-0000-0000000000b1';
insert into invoice_lines (walker_id, client_id, invoice_id, kind, description, occurred_on, unit_cents) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'extra', 'Late fee', current_date, 300);
update invoices set status = 'sent' where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    update invoices set status = 'void' where id = '60000000-0000-0000-0000-000000000002';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Voided an invoice that has payments'; end if;
  end;
end $$;
update invoices set status = 'void' where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  if (select status from invoices where id = '60000000-0000-0000-0000-000000000001') <> 'void' then raise exception 'Walker could not void a sent invoice'; end if;
  if (select invoice_id from invoice_lines where walk_id = '30000000-0000-0000-0000-0000000000b1') is not null then
    raise exception 'Voiding should return walk lines to unbilled';
  end if;
  if (select invoice_id from invoice_lines where description = 'Late fee') is distinct from '60000000-0000-0000-0000-000000000001' then
    raise exception 'Extras stay on the voided invoice';
  end if;
  if (select void_total_cents from invoices where id = '60000000-0000-0000-0000-000000000001') is null then raise exception 'Void total not kept'; end if;
  begin
    update invoices set status = 'sent' where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Un-voided an invoice'; end if;
  end;
end $$;
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select status from invoices where id = '60000000-0000-0000-0000-000000000001') <> 'void' then raise exception 'Client should see the invoice as voided'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Suspended walkers are locked out in the database (0016); paused ones aren't.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
update coverage_approvals set revoked_at = null where coverage_walker_id = '00000000-0000-0000-0000-00000000000b';
update walkers set status = 'paused' where id = '00000000-0000-0000-0000-00000000000a';
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if not exists (select 1 from clients) or not exists (select 1 from dogs) or not exists (select 1 from bookings)
     or not exists (select 1 from walks) or not exists (select 1 from invoices) then
    raise exception 'Paused walker should keep working';
  end if;
end $$;
-- A (paused, still working) asks B for a cover; B accepts. Another open ask waits.
insert into coverage_requests (id, booking_id, from_walker_id, to_walker_id, occurs_on, starts_at, tz) values
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000b', current_date + 20, now() + interval '20 days', 'America/Los_Angeles'),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000b', current_date + 21, now() + interval '21 days', 'America/Los_Angeles');
select _as('00000000-0000-0000-0000-00000000000b');
update coverage_requests set status = 'accepted' where id = '50000000-0000-0000-0000-000000000003';

-- The operator suspends both.
select _as('00000000-0000-0000-0000-00000000000e');
update walkers set status = 'suspended' where id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');
reset role;
do $$ begin
  if (select status from coverage_requests where id = '50000000-0000-0000-0000-000000000003') <> 'cancelled' then
    raise exception 'Suspending B should cancel B''s upcoming accepted cover';
  end if;
end $$;
-- Admin re-opens one ask to B, to prove B can't accept while suspended.
select set_config('request.jwt.claim.sub', '', true);
update coverage_requests set status = 'open' where id = '50000000-0000-0000-0000-000000000004';
set local role authenticated;

select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if exists (select 1 from clients) or exists (select 1 from dogs) or exists (select 1 from bookings) or exists (select 1 from booking_dogs)
     or exists (select 1 from walks) or exists (select 1 from walk_dogs) or exists (select 1 from invoices) or exists (select 1 from invoice_lines)
     or exists (select 1 from payments) or exists (select 1 from messages) or exists (select 1 from coverage_requests)
     or exists (select 1 from my_coverage()) or exists (select 1 from open_due_check_ins('UTC')) then
    raise exception 'Suspended walker can still read client data';
  end if;
  begin
    insert into clients (walker_id, name) values ('00000000-0000-0000-0000-00000000000a', 'New client');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Suspended walker added a client'; end if;
  end;
  begin
    insert into walks (walker_id, service_type_id, status, started_at)
      select '00000000-0000-0000-0000-00000000000a', id, 'in_progress', now() from service_types where key = 'group_walk';
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Suspended walker started a walk'; end if;
  end;
  begin
    perform reschedule_coverage('40000000-0000-0000-0000-000000000001', current_date, now(), 60, true);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Suspended walker rescheduled coverage'; end if;
  end;
end $$;
update clients set name = 'Hacked' where walker_id = '00000000-0000-0000-0000-00000000000a';
update invoices set notes = 'Hacked' where walker_id = '00000000-0000-0000-0000-00000000000a';
delete from dogs where walker_id = '00000000-0000-0000-0000-00000000000a';
select _as('00000000-0000-0000-0000-00000000000b');
update coverage_requests set status = 'accepted' where id = '50000000-0000-0000-0000-000000000004';
reset role;
do $$ begin
  if exists (select 1 from clients where name = 'Hacked') or exists (select 1 from invoices where notes = 'Hacked') then
    raise exception 'Suspended walker changed client data';
  end if;
  if not exists (select 1 from dogs where walker_id = '00000000-0000-0000-0000-00000000000a') then raise exception 'Suspended walker deleted dogs'; end if;
  if (select status from coverage_requests where id = '50000000-0000-0000-0000-000000000004') <> 'open' then
    raise exception 'Suspended walker accepted coverage';
  end if;
end $$;
-- Nobody can ask a suspended walker to cover. (B back to active, A asks D who's suspended.)
select set_config('request.jwt.claim.sub', '', true);
update walkers set status = 'active' where id = '00000000-0000-0000-0000-00000000000a';
update walkers set status = 'suspended' where id = '00000000-0000-0000-0000-00000000000b';
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if not exists (select 1 from clients) then raise exception 'Reactivated walker should see their clients again'; end if;
  begin
    insert into coverage_requests (booking_id, from_walker_id, to_walker_id, occurs_on, starts_at, tz)
      values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
              current_date + 22, now() + interval '22 days', 'America/Los_Angeles');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Coverage requested from a suspended walker'; end if;
  end;
end $$;
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if not exists (select 1 from clients) or not exists (select 1 from invoices) then raise exception 'Clients keep seeing their own data'; end if;
end $$;

reset role;
select 'RLS smoke test passed' as result;
rollback;
