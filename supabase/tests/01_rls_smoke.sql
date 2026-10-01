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
  if (select array_agg(k order by k) from jsonb_object_keys(p) k) <> array['avatar_url','background_checked','bio','boarding','business_name','full_name',
      'handle','rating_avg','rating_count','service_area','services','space_photos'] then
    raise exception 'Public profile has unexpected fields: %', (select array_agg(k) from jsonb_object_keys(p) k);
  end if;
  if (p->>'rating_count')::int <> 2 or jsonb_array_length(p->'services') <> 1 or (p->'services'->0->>'rate_cents')::int <> 2500 then
    raise exception 'Public profile rating or services wrong: %', p;
  end if;
  if t ilike any (array['%555-PRIVATE%', '%secret-proof%', '%Secret Lane%', '%Key under%', '%owner@x.test%', '%Dexter%', '%a@x.test%'])
    then raise exception 'Public profile leaks private data: %', t; end if;
end $$;
-- Private tables: a logged-out visitor is refused (0025: the RLS helpers aren't
-- callable without signing in) or sees nothing. Never a row.
do $$
declare t text; n int;
begin
  foreach t in array array['walkers', 'clients', 'dogs', 'profiles', 'walks', 'photos', 'ratings', 'invoices', 'boarding_stays', 'messages'] loop
    begin
      execute format('select count(*) from %I', t) into n;
      if n > 0 then raise exception 'Logged-out visitor can read %', t; end if;
    exception when insufficient_privilege then null; -- refused: fine
    end;
  end loop;
  begin
    perform 1 from walker_rating_summary;
    raise exception 'SHOULD_FAIL';
  exception when insufficient_privilege then null;
    when others then if sqlerrm = 'SHOULD_FAIL' then raise exception 'Logged-out visitor can read the rating summary view'; end if; raise;
  end;
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
-- Tagged photos and pet ratings (0017). Walker A's second client F shares a
-- group walk with client C. A photo tagged with one client's pet is theirs only;
-- an untagged photo is the whole group's.
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f2', 'f@x.test', '{"role":"client","full_name":"Client F"}');
insert into clients (id, walker_id, profile_id, name, status) values
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'Biscuit''s owner', 'active');
insert into dogs (id, client_id, walker_id, name) values
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'Biscuit');
insert into walks (id, walker_id, service_type_id, status, started_at)
  select '30000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', id, 'in_progress', now() from service_types where key = 'group_walk';
insert into walk_dogs (walk_id, dog_id) values
  ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000004');
insert into storage.objects (bucket_id, name) values
  ('photos', 'a/f1/dexter-only.jpg'), ('photos', 'a/f1/biscuit-only.jpg'), ('photos', 'a/f1/group.jpg'), ('photos', 'a/f1/both.jpg');
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000a');
insert into photos (id, walker_id, walk_id, storage_path) values
  ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', 'a/f1/dexter-only.jpg'),
  ('70000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', 'a/f1/biscuit-only.jpg'),
  ('70000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', 'a/f1/group.jpg'),
  ('70000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', 'a/f1/both.jpg');
insert into photo_pets (photo_id, dog_id) values
  ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004'),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004');
insert into pet_scores (walker_id, walk_id, dog_id, category, score) values
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000001', 'energy', 2),
  ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000004', 'energy', 5);
do $$ begin
  -- Tags and scores only for pets on this walk.
  begin
    insert into photo_pets (photo_id, dog_id) values ('70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Tagged a photo with a pet who wasn''t on the walk'; end if;
  end;
  begin
    insert into pet_scores (walker_id, walk_id, dog_id, category, score)
      values ('00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f1', '20000000-0000-0000-0000-000000000002', 'mood', 3);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Scored another walker''s pet'; end if;
  end;
end $$;
-- Until the walk is finished, owners see none of its photos (tags aren't final yet).
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if exists (select 1 from photos where walk_id = '30000000-0000-0000-0000-0000000000f1')
     or exists (select 1 from storage.objects where name like 'a/f1/%') then
    raise exception 'Client sees photos of a walk that isn''t finished';
  end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
update walks set status = 'done', ended_at = now() where id = '30000000-0000-0000-0000-0000000000f1';
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select string_agg(storage_path, ',' order by storage_path) from photos where walk_id = '30000000-0000-0000-0000-0000000000f1')
     <> 'a/f1/both.jpg,a/f1/dexter-only.jpg,a/f1/group.jpg' then
    raise exception 'Client C should see Dexter''s, both-tagged and group photos only, saw %',
      (select string_agg(storage_path, ',' order by storage_path) from photos where walk_id = '30000000-0000-0000-0000-0000000000f1');
  end if;
  if exists (select 1 from storage.objects where name = 'a/f1/biscuit-only.jpg') then raise exception 'Client C can open Biscuit''s photo file'; end if;
  if not exists (select 1 from storage.objects where name = 'a/f1/group.jpg') then raise exception 'Client C can''t open the group photo file'; end if;
  if (select count(*) from pet_scores) <> 1 or (select dog_id from pet_scores) <> '20000000-0000-0000-0000-000000000001' then
    raise exception 'Client C should see only Dexter''s score';
  end if;
  if exists (select 1 from photo_pets where dog_id = '20000000-0000-0000-0000-000000000004') then raise exception 'Client C sees Biscuit''s tags'; end if;
end $$;
select _as('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  if (select string_agg(storage_path, ',' order by storage_path) from photos where walk_id = '30000000-0000-0000-0000-0000000000f1')
     <> 'a/f1/biscuit-only.jpg,a/f1/both.jpg,a/f1/group.jpg' then
    raise exception 'Client F should see Biscuit''s, both-tagged and group photos only';
  end if;
  if exists (select 1 from storage.objects where name = 'a/f1/dexter-only.jpg') then raise exception 'Client F can open Dexter''s photo file'; end if;
  if (select count(*) from pet_scores) <> 1 then raise exception 'Client F should see only Biscuit''s score'; end if;
  begin
    insert into photo_pets (photo_id, dog_id) values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Client re-tagged a photo to see it'; end if;
  end;
end $$;
-- The walker's setting (0024): untagged photos to no one. Then back on for the rest of the test.
select _as('00000000-0000-0000-0000-00000000000a');
update walkers set untagged_photos_to_all = false where id = '00000000-0000-0000-0000-00000000000a';
select _as('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  if exists (select 1 from photos where storage_path = 'a/f1/group.jpg') or exists (select 1 from storage.objects where name = 'a/f1/group.jpg') then
    raise exception 'Untagged photo shown although the walker set untagged photos to no one';
  end if;
  if not exists (select 1 from photos where storage_path = 'a/f1/both.jpg') then raise exception 'Tagged photos should still show'; end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
update walkers set untagged_photos_to_all = true where id = '00000000-0000-0000-0000-00000000000a';
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from pet_scores) or exists (select 1 from photo_pets) then raise exception 'Unrelated walker sees scores or tags'; end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(*) from photos where walk_id = '30000000-0000-0000-0000-0000000000f1') <> 4 then raise exception 'Walker should see all their walk photos'; end if;
  if (select count(*) from walker_time_off) <> 0 then raise exception 'setup'; end if;
end $$;
insert into walker_time_off (walker_id, starts_on, ends_on) values ('00000000-0000-0000-0000-00000000000a', current_date + 3, current_date + 5);
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from walker_time_off) then raise exception 'Walker B sees A''s time off'; end if;
end $$;

-- Finishing a walk is all or nothing (0019).
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into walks (id, walker_id, service_type_id, status, started_at)
  select '30000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a', id, 'in_progress', now() - interval '1 hour' from service_types where key = 'group_walk';
insert into walk_dogs (walk_id, dog_id) values ('30000000-0000-0000-0000-0000000000f2', '20000000-0000-0000-0000-000000000001');
insert into photos (id, walker_id, walk_id, storage_path) values
  ('70000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-0000000000f2', 'a/f2/x.jpg');
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  begin
    perform finish_walk('30000000-0000-0000-0000-0000000000f2', '[]', '[]', '[]', '[]', 'hijack', null, 0, 0, now());
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Walker B finished walker A''s walk'; end if;
  end;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  -- A bad tag (Anubis wasn't on this walk) fails the whole thing: no log, not done.
  begin
    perform finish_walk('30000000-0000-0000-0000-0000000000f2',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","kind":"poop"}]',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","category":"mood","score":4}]', '[]',
      '[{"photo_id":"70000000-0000-0000-0000-000000000005","dog_ids":["20000000-0000-0000-0000-000000000002"]}]',
      'x', null, 5, 30, now());
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'finish_walk accepted a tag for a pet not on the walk'; end if;
  end;
  if exists (select 1 from walk_events where walk_id = '30000000-0000-0000-0000-0000000000f2')
     or exists (select 1 from pet_scores where walk_id = '30000000-0000-0000-0000-0000000000f2')
     or (select status from walks where id = '30000000-0000-0000-0000-0000000000f2') <> 'in_progress' then
    raise exception 'A failed finish left part of the wrap-up saved';
  end if;
  if finish_walk('30000000-0000-0000-0000-0000000000f2',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","kind":"poop"},{"dog_id":"20000000-0000-0000-0000-000000000001","kind":"poop"}]',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","category":"mood","score":4}]',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","text":"heel"}]',
      '[{"photo_id":"70000000-0000-0000-0000-000000000005","dog_ids":["20000000-0000-0000-0000-000000000001"]}]',
      'Good walk', 1200, 5, 30, now()) <> 'done' then
    raise exception 'finish_walk should finish';
  end if;
  if finish_walk('30000000-0000-0000-0000-0000000000f2', '[{"dog_id":"20000000-0000-0000-0000-000000000001","kind":"poop"}]', '[]', '[]', '[]', 'again', null, 0, 0, now()) <> 'already done' then
    raise exception 'A second Finish should do nothing';
  end if;
  if (select count(*) from walk_events where walk_id = '30000000-0000-0000-0000-0000000000f2') <> 2
     or (select summary from walks where id = '30000000-0000-0000-0000-0000000000f2') <> 'Good walk'
     or (select working_on from walk_dogs where walk_id = '30000000-0000-0000-0000-0000000000f2') <> 'heel'
     or (select count(*) from photo_pets where photo_id = '70000000-0000-0000-0000-000000000005') <> 1 then
    raise exception 'finish_walk saved the wrong things';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Boarding (0020): clients see only their own stays and posted updates;
-- walkers only their own clients' stays (covering a walk gives nothing here).
-- ---------------------------------------------------------------------------
select _as('00000000-0000-0000-0000-00000000000a');
update walkers set boarding_capacity = 2, boarding_night_cents = 5000, boarding_extra_pet_cents = 3000 where id = '00000000-0000-0000-0000-00000000000a';
insert into boarding_stays (id, walker_id, client_id, starts_at, ends_at, start_day, end_day, nights, night_cents, extra_pet_cents, price_cents) values
  ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
   now(), now() + interval '2 days', current_date, current_date + 2, 2, 5000, 3000, 16000);
insert into stay_pets (stay_id, dog_id) values
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003');
insert into stay_updates (id, stay_id, walker_id, day) values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', current_date);
insert into photos (id, walker_id, stay_update_id, storage_path) values
  ('70000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '81000000-0000-0000-0000-000000000001', 'a/stay/day1.jpg');
reset role;
insert into storage.objects (bucket_id, name) values ('photos', 'a/stay/day1.jpg');
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    insert into boarding_stays (walker_id, client_id, starts_at, ends_at, start_day, end_day, nights, price_cents)
      values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', now(), now() + interval '1 day', current_date, current_date + 1, 1, 0);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Walker booked a stay for another walker''s client'; end if;
  end;
  begin
    insert into stay_pets (stay_id, dog_id) values ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Added another client''s pet to a stay'; end if;
  end;
end $$;
-- Before it's posted, the owner sees the stay but not the day's update or its photo.
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from boarding_stays) <> 1 or (select count(*) from stay_pets) <> 2 then raise exception 'Client should see their stay and its pets'; end if;
  if exists (select 1 from stay_updates) or exists (select 1 from photos where stay_update_id is not null)
     or exists (select 1 from storage.objects where name = 'a/stay/day1.jpg') then
    raise exception 'Client sees an update that isn''t posted';
  end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  -- Posting is all or nothing: a tag for a pet not on the stay fails the whole post.
  begin
    perform post_stay_update('81000000-0000-0000-0000-000000000001',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","kind":"fed","count":2}]', '[]',
      '[{"photo_id":"70000000-0000-0000-0000-000000000009","dog_ids":["20000000-0000-0000-0000-000000000004"]}]', 'x');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Tagged a stay photo with a pet not on the stay'; end if;
  end;
  if exists (select 1 from stay_update_logs) or (select posted_at from stay_updates where id = '81000000-0000-0000-0000-000000000001') is not null then
    raise exception 'A failed post left part of the update saved';
  end if;
  if post_stay_update('81000000-0000-0000-0000-000000000001',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","kind":"fed","count":2},{"dog_id":"20000000-0000-0000-0000-000000000003","kind":"play","count":1}]',
      '[{"dog_id":"20000000-0000-0000-0000-000000000001","category":"mood","score":5}]',
      '[{"photo_id":"70000000-0000-0000-0000-000000000009","dog_ids":["20000000-0000-0000-0000-000000000001"]}]',
      'Settled in well') is null then
    raise exception 'First post should return when it was posted';
  end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select note from stay_updates) <> 'Settled in well' or (select count(*) from stay_update_logs) <> 2
     or (select count(*) from pet_scores where stay_update_id is not null) <> 1
     or not exists (select 1 from photos where id = '70000000-0000-0000-0000-000000000009')
     or not exists (select 1 from storage.objects where name = 'a/stay/day1.jpg') then
    raise exception 'Client should see the posted update, its taps, rating and photo';
  end if;
end $$;
-- Another client of the same walker, walker B (covering C''s walks right now) and D see none of it.
select _as('00000000-0000-0000-0000-0000000000f2');
do $$ begin
  if exists (select 1 from boarding_stays) or exists (select 1 from stay_updates) or exists (select 1 from stay_pets)
     or exists (select 1 from photos where stay_update_id is not null) then
    raise exception 'Another client sees someone else''s stay';
  end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from boarding_stays) or exists (select 1 from stay_updates) or exists (select 1 from stay_update_logs)
     or exists (select 1 from photos where stay_update_id is not null) then
    raise exception 'Another walker sees a stay';
  end if;
  begin
    perform end_stay('80000000-0000-0000-0000-000000000001');
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'Walker B ended walker A''s stay'; end if;
  end;
end $$;
-- Reminders (0025): service role only. A signed-in walker can't call it at all.
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  begin
    perform claim_stay_reminders('00000000-0000-0000-0000-00000000000a', current_date + 2);
    raise exception 'SHOULD_FAIL';
  exception when insufficient_privilege then null;
    when others then if sqlerrm = 'SHOULD_FAIL' then raise exception 'A signed-in walker called claim_stay_reminders'; end if; raise;
  end;
end $$;
-- The server (service role) claims for the signed-in person: once, and only their stays.
set local role service_role;
do $$ begin
  if (select count(*) from claim_stay_reminders('00000000-0000-0000-0000-00000000000b', current_date + 2)) <> 0 then raise exception 'Claimed walker A''s reminder for walker B'; end if;
  if (select count(*) from claim_stay_reminders('00000000-0000-0000-0000-00000000000a', current_date + 2)) <> 1 then raise exception 'Expected one "ends tomorrow" reminder'; end if;
  if (select count(*) from claim_stay_reminders('00000000-0000-0000-0000-00000000000a', current_date + 2)) <> 0 then raise exception 'A reminder was claimed twice'; end if;
end $$;
set local role authenticated;
-- The walker's space (0022): their own clients read the rows; everyone else only
-- through the public profile, which carries the photos and boarding rates.
select _as('00000000-0000-0000-0000-00000000000a');
insert into walker_space_photos (walker_id, storage_path, caption) values ('00000000-0000-0000-0000-00000000000a', 'a/space-1.jpg', 'Back yard');
select _as('00000000-0000-0000-0000-00000000000c');
do $$ begin
  if (select count(*) from walker_space_photos) <> 1 then raise exception 'Client should see their walker''s space photos'; end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from walker_space_photos) then raise exception 'Another walker reads the space photos table'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$
declare p jsonb := public_walker_profile('walker-a');
begin
  begin
    if exists (select 1 from walker_space_photos) then raise exception 'Logged-out visitor reads the space photos table'; end if;
  exception when insufficient_privilege then null; -- refused (0025): fine
  end;
  if jsonb_array_length(p->'space_photos') <> 1 or (p->'boarding'->>'night_cents')::int <> 5000 then
    raise exception 'Public profile should show the space photo and boarding rate: %', p;
  end if;
end $$;
set local role authenticated;
-- Pick-up: the stay goes on the bill. 2 nights × $50, 1 extra pet × 2 × $30 = $160.
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if end_stay('80000000-0000-0000-0000-000000000001') <> 'done' then raise exception 'end_stay should finish'; end if;
  if end_stay('80000000-0000-0000-0000-000000000001') <> 'already done' then raise exception 'Ending twice should do nothing'; end if;
  if (select sum(amount_cents) from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000001') <> 16000
     or (select count(*) from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Stay should bill $160 in two lines, got %', (select string_agg(description || '=' || amount_cents, '; ') from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000001');
  end if;
end $$;
-- Early pick-up (0024): with 'actual', a 3-night stay picked up after 1 night bills 1 night.
select _as('00000000-0000-0000-0000-00000000000a');
update walkers set boarding_early_pickup = 'actual' where id = '00000000-0000-0000-0000-00000000000a';
insert into boarding_stays (id, walker_id, client_id, starts_at, ends_at, start_day, end_day, nights, night_cents, extra_pet_cents, price_cents) values
  ('80000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
   now() - interval '1 day', now() + interval '2 days', current_date - 1, current_date + 2, 3, 5000, 3000, 15000);
insert into stay_pets (stay_id, dog_id) values ('80000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001');
do $$ begin
  perform end_stay('80000000-0000-0000-0000-000000000002');
  if (select sum(amount_cents) from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000002') <> 5000
     or (select quantity from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000002' and kind = 'stay') <> 1 then
    raise exception 'Early pick-up with "bill nights stayed" should bill 1 night ($50), got %',
      (select string_agg(description || '=' || amount_cents, '; ') from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000002');
  end if;
end $$;
update walkers set boarding_early_pickup = 'booked' where id = '00000000-0000-0000-0000-00000000000a';
-- Voiding the invoice a stay was on sends the stay back to unbilled (0023), like a walk.
insert into invoices (id, walker_id, client_id, period_start, period_end, number) values
  ('60000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', current_date, current_date, 0);
update invoice_lines set invoice_id = '60000000-0000-0000-0000-000000000009' where stay_id = '80000000-0000-0000-0000-000000000001';
update invoices set status = 'sent' where id = '60000000-0000-0000-0000-000000000009';
update invoices set status = 'void' where id = '60000000-0000-0000-0000-000000000009';
do $$ begin
  if exists (select 1 from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000001' and invoice_id is not null)
     or (select count(*) from invoice_lines where stay_id = '80000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Voiding should put the stay back to unbilled';
  end if;
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
  -- reschedule_coverage is service role only (0025): refused outright for a signed-in walker.
  begin
    perform reschedule_coverage('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', current_date, now(), 60, true);
    raise exception 'SHOULD_FAIL';
  exception when insufficient_privilege then null;
    when others then if sqlerrm = 'SHOULD_FAIL' then raise exception 'A signed-in walker called reschedule_coverage'; end if; raise;
  end;
end $$;
-- And the server can't do it on a suspended walker's behalf.
set local role service_role;
do $$ begin
  begin
    perform reschedule_coverage('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', current_date, now(), 60, true);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm <> 'Not your booking' then raise exception 'Suspended walker rescheduled coverage (%)', sqlerrm; end if;
  end;
end $$;
set local role authenticated;
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

-- reschedule_coverage (0025): the server moves a cover for the booking's own walker; anyone else is refused.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into coverage_requests (id, booking_id, from_walker_id, to_walker_id, occurs_on, starts_at, tz, access_from, access_until, status) values
  ('50000000-0000-0000-0000-000000000009', '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
   '00000000-0000-0000-0000-00000000000d', current_date + 30, now() + interval '30 days', 'UTC', now() + interval '29 days', now() + interval '31 days', 'open');
set local role service_role;
do $$ begin
  begin
    perform reschedule_coverage('00000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-000000000001', current_date + 30, now() + interval '30 days 2 hours', 60, false);
    raise exception 'SHOULD_FAIL';
  exception when others then
    if sqlerrm <> 'Not your booking' then raise exception 'Walker B rescheduled walker A''s cover (%)', sqlerrm; end if;
  end;
  if (select count(*) from reschedule_coverage('00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001',
        current_date + 30, now() + interval '30 days 2 hours', 60, false) where change = 'moved') <> 1 then
    raise exception 'The booking''s own walker should be able to move the cover';
  end if;
end $$;

-- Breached-password notice (0026): a person reads only their own; nobody but the server writes.
reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into password_notices (user_id, state) values ('00000000-0000-0000-0000-00000000000a', 'show');
set local role authenticated;
select _as('00000000-0000-0000-0000-00000000000b');
do $$ begin
  if exists (select 1 from password_notices) then raise exception 'Walker B can see walker A''s password notice'; end if;
end $$;
select _as('00000000-0000-0000-0000-00000000000a');
do $$ begin
  if (select count(*) from password_notices) <> 1 then raise exception 'Walker A should see their own password notice'; end if;
  begin
    update password_notices set state = 'dismissed';
    raise exception 'SHOULD_FAIL';
  exception when insufficient_privilege then null; when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'A person changed their password notice directly'; end if;
  end;
  begin
    insert into password_notices (user_id, state) values ('00000000-0000-0000-0000-00000000000b', 'show');
    raise exception 'SHOULD_FAIL';
  exception when insufficient_privilege then null; when others then
    if sqlerrm = 'SHOULD_FAIL' then raise exception 'A person wrote someone else''s password notice'; end if;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
do $$ begin
  begin
    if exists (select 1 from password_notices) then raise exception 'Logged-out visitor read password notices'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

-- Who may call which function (0025). Any new function must be placed on purpose.
reset role;
do $$
declare f record; bad text := '';
begin
  for f in select p.oid, p.proname, format_type(p.prorettype, null) as ret from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' and p.proname not like '\_%' loop -- _x: this test's own helpers
    if has_function_privilege('anon', f.oid, 'execute') and f.proname <> 'public_walker_profile' then bad := bad || ' anon:' || f.proname; end if;
    if f.ret = 'trigger' and (has_function_privilege('authenticated', f.oid, 'execute') or has_function_privilege('anon', f.oid, 'execute')) then
      bad := bad || ' trigger-callable:' || f.proname; end if;
    if f.proname in ('claim_stay_reminders', 'reschedule_coverage') and has_function_privilege('authenticated', f.oid, 'execute') then
      bad := bad || ' signed-in:' || f.proname; end if;
  end loop;
  if bad <> '' then raise exception 'Functions callable by the wrong people:%', bad; end if;
end $$;

reset role;
select 'RLS smoke test passed' as result;
rollback;
