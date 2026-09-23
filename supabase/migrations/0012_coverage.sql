-- 0012 Coverage squad, per occurrence.
--
-- 0004 covered a whole booking series (bookings.covered_by_walker_id) and gave
-- the covering walker open-ended access. Coverage is now one occurrence of a
-- booking: a request carries the occurrence's date and start, and access to
-- the client's dogs and home notes exists only while the request is accepted,
-- the client still approves that walker, and now() is inside the window
-- (midnight the day before → midnight after, in the requesting walker's zone).
--
-- Also: walkers can only attach events, notes, photos and homework to dogs
-- they walk (their own, or covered right now), and messages must go to a
-- client the sender actually serves.

-- ---------------------------------------------------------------------------
-- New columns and tables (functions below refer to them)
-- ---------------------------------------------------------------------------
alter table coverage_requests
  add column occurs_on date,                -- the occurrence's day in the series (its id)
  add column starts_at timestamptz,         -- when that occurrence actually starts (after any move)
  add column duration_min int,
  add column tz text not null default 'UTC',
  add column access_from timestamptz,
  add column access_until timestamptz,
  add column cancelled_by uuid references walkers (id) on delete set null;
alter table coverage_requests alter column occurs_on set not null, alter column starts_at set not null;
create index coverage_requests_occurrence_idx on coverage_requests (booking_id, occurs_on);
create index coverage_requests_window_idx on coverage_requests (to_walker_id, status, access_until);

-- "Ask for approval": the walker nudges a client about one squad member.
create table coverage_approval_asks (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  coverage_walker_id uuid not null references walkers (id) on delete cascade,
  asked_at timestamptz not null default now(),
  answered_at timestamptz,
  unique (client_id, coverage_walker_id)
);
alter table coverage_approval_asks enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers (security definer: they read across tables the caller can't)
-- ---------------------------------------------------------------------------

-- Accepted squad of any walker (ids only).
create or replace function squad_ids_of(w uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select case when requester_id = w then recipient_id else requester_id end
  from squad_links where status = 'accepted' and (requester_id = w or recipient_id = w);
$$;

-- Clients and dogs the caller is covering right now.
create or replace function covering_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select b.client_id
  from coverage_requests r
  join bookings b on b.id = r.booking_id
  where r.to_walker_id = auth.uid() and r.status = 'accepted'
    and now() >= r.access_from and now() < r.access_until
    and exists (select 1 from coverage_approvals a
                where a.client_id = b.client_id and a.coverage_walker_id = r.to_walker_id and a.revoked_at is null);
$$;

create or replace function covering_dog_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select bd.dog_id
  from coverage_requests r
  join bookings b on b.id = r.booking_id
  join booking_dogs bd on bd.booking_id = b.id
  where r.to_walker_id = auth.uid() and r.status = 'accepted'
    and now() >= r.access_from and now() < r.access_until
    and exists (select 1 from coverage_approvals a
                where a.client_id = b.client_id and a.coverage_walker_id = r.to_walker_id and a.revoked_at is null);
$$;

-- Walks (by anyone) that included the caller's own dogs: covered walks.
create or replace function walks_with_my_dogs()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct wd.walk_id from walk_dogs wd join dogs d on d.id = wd.dog_id where d.walker_id = auth.uid();
$$;

-- Name of whoever walked a walk, for anyone allowed to see that walk.
create or replace function walk_walker_name(p_walk uuid)
returns text language sql stable security definer set search_path = public as $$
  select p.full_name from walks w join profiles p on p.id = w.walker_id
  where w.id = p_walk
    and (w.walker_id = auth.uid()
         or exists (select 1 from walk_client_ids(w.id) c where c in (select my_client_ids()))
         or w.id in (select walks_with_my_dogs()));
$$;

-- ---------------------------------------------------------------------------
-- Squad links
-- ---------------------------------------------------------------------------

-- Exact-handle lookup for walkers. No browsing: one handle in, one card out.
create or replace function find_walker_by_handle(p_handle text)
returns table (id uuid, handle text, full_name text, business_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select w.id, w.handle, p.full_name, w.business_name, p.avatar_url
  from walkers w join profiles p on p.id = w.id
  where current_role_is('walker') and w.handle = lower(trim(p_handle)) and w.status = 'active' and w.id <> auth.uid();
$$;
revoke execute on function find_walker_by_handle(text) from public, anon;
grant execute on function find_walker_by_handle(text) to authenticated;

-- The caller's links, with the other walker's card. Service area and phone
-- only once the link is accepted. Nothing else about them.
create or replace function squad_overview()
returns table (link_id uuid, status link_status, incoming boolean, walker_id uuid, handle text, full_name text,
               business_name text, avatar_url text, service_area text, phone text)
language sql stable security definer set search_path = public as $$
  select l.id, l.status, l.recipient_id = auth.uid(), o.id, o.handle, p.full_name, o.business_name, p.avatar_url,
         case when l.status = 'accepted' then o.service_area end,
         case when l.status = 'accepted' then p.phone end
  from squad_links l
  join walkers o on o.id = case when l.requester_id = auth.uid() then l.recipient_id else l.requester_id end
  join profiles p on p.id = o.id
  where (l.requester_id = auth.uid() or l.recipient_id = auth.uid()) and l.status in ('pending', 'accepted');
$$;
revoke execute on function squad_overview() from public, anon;
grant execute on function squad_overview() to authenticated;

-- Only the invited walker accepts/declines; walkers on a link never change;
-- a requester may re-send after a decline or removal; either side may remove.
create or replace function guard_squad_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_operator() then return new; end if;
  if new.requester_id <> old.requester_id or new.recipient_id <> old.recipient_id then
    raise exception 'A link''s walkers can''t change';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('accepted', 'declined') and not (old.status = 'pending' and auth.uid() = old.recipient_id) then
      raise exception 'Only the invited walker can accept or decline';
    elsif new.status = 'pending' and not (auth.uid() = old.requester_id and old.status in ('declined', 'removed')) then
      raise exception 'That link can''t be reopened';
    end if;
  end if;
  return new;
end $$;
create trigger squad_links_guard before update on squad_links
  for each row execute function guard_squad_link();

-- Leaving a squad cancels upcoming coverage between the two.
create or replace function squad_link_ended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'accepted' and new.status <> 'accepted' then
    perform set_config('app.coverage_system', 'on', true);
    update coverage_requests set status = 'cancelled', cancelled_by = auth.uid()
    where status in ('open', 'accepted') and access_until > now()
      and ((from_walker_id = new.requester_id and to_walker_id = new.recipient_id)
        or (from_walker_id = new.recipient_id and to_walker_id = new.requester_id));
    perform set_config('app.coverage_system', 'off', true);
  end if;
  return new;
end $$;
create trigger squad_links_ended after update on squad_links
  for each row execute function squad_link_ended();

-- ---------------------------------------------------------------------------
-- Client approvals
-- ---------------------------------------------------------------------------

-- A client can only approve walkers in their walker's squad.
drop policy "client manages own approvals" on coverage_approvals;
create policy "client manages own approvals" on coverage_approvals for all
  using (client_id in (select my_client_ids()))
  with check (exists (select 1 from clients c where c.id = client_id and c.profile_id = auth.uid()
                      and coverage_walker_id in (select squad_ids_of(c.walker_id))));

-- Revoking an approval cancels that walker's upcoming coverage for this client.
create or replace function approval_revoked()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    perform set_config('app.coverage_system', 'on', true);
    update coverage_requests r set status = 'cancelled', cancelled_by = null
    from bookings b
    where b.id = r.booking_id and b.client_id = new.client_id and r.to_walker_id = new.coverage_walker_id
      and r.status in ('open', 'accepted') and r.access_until > now();
    perform set_config('app.coverage_system', 'off', true);
  end if;
  return new;
end $$;
create trigger coverage_approvals_revoked after update on coverage_approvals
  for each row execute function approval_revoked();

-- The client's view of their walker's squad: name, photo, handle, rating.
create or replace function client_squad_choices()
returns table (client_id uuid, walker_id uuid, coverage_walker_id uuid, handle text, full_name text, avatar_url text,
               rating_avg numeric, rating_count int, approved boolean, asked boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.walker_id, s.id, s.handle, p.full_name, p.avatar_url, r.avg_score, coalesce(r.rating_count, 0),
         exists (select 1 from coverage_approvals a where a.client_id = c.id and a.coverage_walker_id = s.id and a.revoked_at is null),
         exists (select 1 from coverage_approval_asks k where k.client_id = c.id and k.coverage_walker_id = s.id and k.answered_at is null)
  from clients c
  cross join lateral squad_ids_of(c.walker_id) sid
  join walkers s on s.id = sid and s.status = 'active'
  join profiles p on p.id = s.id
  left join walker_rating_summary r on r.walker_id = s.id
  where c.profile_id = auth.uid() and c.status = 'active';
$$;

create policy "walker asks own clients about squad" on coverage_approval_asks for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid())
              and coverage_walker_id in (select my_squad_ids()));
create policy "client reads own asks" on coverage_approval_asks for select using (client_id in (select my_client_ids()));
create policy "client answers own asks" on coverage_approval_asks for update
  using (client_id in (select my_client_ids())) with check (client_id in (select my_client_ids()));

create or replace function guard_approval_ask()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.walker_id <> auth.uid() and not is_operator() then
    if row(new.walker_id, new.client_id, new.coverage_walker_id, new.asked_at)
       is distinct from row(old.walker_id, old.client_id, old.coverage_walker_id, old.asked_at) then
      raise exception 'Clients can only answer';
    end if;
  end if;
  return new;
end $$;
create trigger coverage_approval_asks_guard before update on coverage_approval_asks
  for each row execute function guard_approval_ask();

-- ---------------------------------------------------------------------------
-- Coverage requests: one occurrence each
-- ---------------------------------------------------------------------------

-- The window is computed here, never taken from the caller.
create or replace function prepare_coverage_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d date;
begin
  begin
    perform now() at time zone new.tz;
  exception when others then
    new.tz := 'UTC';
  end;
  d := (new.starts_at at time zone new.tz)::date;
  new.access_from := (d - 1)::timestamp at time zone new.tz;
  new.access_until := (d + 1)::timestamp at time zone new.tz;
  new.status := 'open';
  new.responded_at := null;
  new.cancelled_by := null;
  if new.duration_min is null then
    select duration_min into new.duration_min from bookings where id = new.booking_id;
  end if;
  return new;
end $$;
create trigger coverage_requests_prepare before insert on coverage_requests
  for each row execute function prepare_coverage_request();

-- Only status changes. Asked walker accepts/declines an open request (and only
-- if the client approves them); either walker can cancel an open or accepted one.
create or replace function guard_coverage_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if auth.uid() is null or is_operator() or current_setting('app.coverage_system', true) = 'on' then
    return new;
  end if;
  if row(new.booking_id, new.from_walker_id, new.to_walker_id, new.occurs_on, new.starts_at, new.duration_min,
         new.tz, new.access_from, new.access_until, new.message)
     is distinct from row(old.booking_id, old.from_walker_id, old.to_walker_id, old.occurs_on, old.starts_at, old.duration_min,
         old.tz, old.access_from, old.access_until, old.message) then
    raise exception 'Only the status of a coverage request can change';
  end if;
  if new.status is distinct from old.status then
    if new.status in ('accepted', 'declined') then
      if not (old.status = 'open' and auth.uid() = old.to_walker_id) then
        raise exception 'Only the asked walker can accept or decline an open request';
      end if;
      if new.status = 'accepted' then
        select client_id into cid from bookings where id = new.booking_id;
        if not exists (select 1 from coverage_approvals
                       where client_id = cid and coverage_walker_id = new.to_walker_id and revoked_at is null) then
          raise exception 'Client has not approved this walker for coverage';
        end if;
        if new.to_walker_id not in (select squad_ids_of(new.from_walker_id)) then
          raise exception 'You''re no longer in each other''s squad';
        end if;
      end if;
      new.responded_at := now();
    elsif new.status = 'cancelled' then
      if old.status not in ('open', 'accepted') then raise exception 'Nothing to cancel'; end if;
      new.cancelled_by := auth.uid();
    else
      raise exception 'That status change isn''t allowed';
    end if;
  end if;
  return new;
end $$;
create trigger coverage_requests_guard before update on coverage_requests
  for each row execute function guard_coverage_request();

-- On acceptance: close the other open asks for that day, and tell the client.
-- (Replaces 0004's version, which set covered_by_walker_id on the whole series.)
create or replace function apply_coverage_acceptance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  dog_list text;
  who text;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    perform set_config('app.coverage_system', 'on', true);
    update coverage_requests set status = 'cancelled'
      where booking_id = new.booking_id and occurs_on = new.occurs_on and id <> new.id and status = 'open';
    perform set_config('app.coverage_system', 'off', true);

    select client_id into cid from bookings where id = new.booking_id;
    select string_agg(d.name, ' and ' order by d.name) into dog_list
      from booking_dogs bd join dogs d on d.id = bd.dog_id where bd.booking_id = new.booking_id;
    select full_name into who from profiles where id = new.to_walker_id;
    insert into messages (walker_id, client_id, sender_id, kind, body)
    values (new.from_walker_id, cid, new.to_walker_id, 'custom',
            format('%s is covering %s''s walk on %s.', who, coalesce(dog_list, 'your dog'),
                   to_char(new.starts_at at time zone new.tz, 'FMDay, FMMonth FMDD')));
  end if;
  return new;
end $$;

-- Asking: your own booking, a squad member, and one this client approved.
drop policy "walker asks squad for coverage" on coverage_requests;
create policy "walker asks squad for coverage" on coverage_requests for insert
  with check (
    from_walker_id = auth.uid() and to_walker_id in (select my_squad_ids())
    and exists (select 1 from bookings b where b.id = booking_id and b.walker_id = auth.uid()
                and exists (select 1 from coverage_approvals a where a.client_id = b.client_id
                            and a.coverage_walker_id = to_walker_id and a.revoked_at is null))
  );

-- Both walkers' view of their requests, with just enough to decide.
create or replace function my_coverage()
returns table (id uuid, status coverage_status, incoming boolean, booking_id uuid, occurs_on date, starts_at timestamptz,
               duration_min int, access_from timestamptz, access_until timestamptz, message text,
               responded_at timestamptz, created_at timestamptz, from_walker_id uuid, from_name text,
               to_walker_id uuid, to_name text, client_id uuid, client_name text, dog_ids uuid[], dog_names text,
               cancelled_by uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.status, r.to_walker_id = auth.uid(), r.booking_id, r.occurs_on, r.starts_at, r.duration_min,
         r.access_from, r.access_until, r.message, r.responded_at, r.created_at,
         r.from_walker_id, fp.full_name, r.to_walker_id, tp.full_name, b.client_id, c.name,
         array(select bd.dog_id from booking_dogs bd where bd.booking_id = b.id),
         (select string_agg(d.name, ', ' order by d.name) from booking_dogs bd join dogs d on d.id = bd.dog_id where bd.booking_id = b.id),
         r.cancelled_by
  from coverage_requests r
  join bookings b on b.id = r.booking_id
  join clients c on c.id = b.client_id
  join profiles fp on fp.id = r.from_walker_id
  join profiles tp on tp.id = r.to_walker_id
  where r.from_walker_id = auth.uid() or r.to_walker_id = auth.uid();
$$;
revoke execute on function my_coverage() from public, anon;
grant execute on function my_coverage() to authenticated;

-- ---------------------------------------------------------------------------
-- Access for the covering walker: only inside the window
-- ---------------------------------------------------------------------------
drop policy "covering walker reads client" on clients;
drop policy "covering walker reads dogs" on dogs;
create policy "covering walker reads client in window" on clients for select
  using (id in (select covering_client_ids()));
create policy "covering walker reads dogs in window" on dogs for select
  using (id in (select covering_dog_ids()));

-- Only your own dogs, or dogs you're covering right now, go on your walks.
drop policy "walk_dogs via walk" on walk_dogs;
create policy "walk_dogs via walk" on walk_dogs for all
  using (exists (select 1 from walks w where w.id = walk_id and (w.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid())
              and (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid())
                   or dog_id in (select covering_dog_ids())));

-- Events, notes, photos, homework: only about dogs you walk.
drop policy "walk_events via walk" on walk_events;
create policy "walk_events via walk" on walk_events for all
  using (exists (select 1 from walks w where w.id = walk_id and (w.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid())
              and (dog_id is null or exists (select 1 from walk_dogs wd where wd.walk_id = walk_events.walk_id and wd.dog_id = walk_events.dog_id)));

drop policy "walker manages notes" on dog_notes;
create policy "walker manages notes" on dog_notes for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()) or dog_id in (select covering_dog_ids())));

drop policy "walker manages photos" on photos;
create policy "walker manages photos" on photos for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and (walk_id is null or exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid()))
              and (dog_id is null or exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid())
                   or dog_id in (select covering_dog_ids())));

drop policy "walker manages homework" on homework;
create policy "walker manages homework" on homework for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() and exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()));

drop policy "walker manages incidents" on incidents;
create policy "walker manages incidents" on incidents for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and (dog_id is null or exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid())
                   or dog_id in (select covering_dog_ids())));

-- ---------------------------------------------------------------------------
-- The regular walker sees the full report of a covered walk
-- ---------------------------------------------------------------------------
create policy "walker reads walks with own dogs" on walks for select
  using (id in (select walks_with_my_dogs()));
create policy "walker reads own dogs on any walk" on walk_dogs for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()));
create policy "walker reads gps of walks with own dogs" on gps_points for select
  using (walk_id in (select walks_with_my_dogs()));
create policy "walker reads events for own dogs" on walk_events for select
  using (walk_id in (select walks_with_my_dogs())
         and (dog_id is null or exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid())));
create policy "walker reads notes on own dogs" on dog_notes for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()));
create policy "walker reads photos of own dogs" on photos for select
  using (walk_id in (select walks_with_my_dogs())
         and (dog_id is null or exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid())));
create policy "walker reads incidents about own dogs" on incidents for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()));
create policy "walker reads covered walk photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p
    where p.storage_path = storage.objects.name and p.walk_id in (select public.walks_with_my_dogs())
      and (p.dog_id is null or exists (select 1 from public.dogs d where d.id = p.dog_id and d.walker_id = auth.uid()))));

-- ---------------------------------------------------------------------------
-- Messages: two-way, and only between people who actually work together
-- ---------------------------------------------------------------------------
drop policy "walker reads/sends messages" on messages;
create policy "walker reads/sends messages" on messages for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() and sender_id = auth.uid()
              and (exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid())
                   or client_id in (select covering_client_ids())));
-- Walkers see everything sent to their clients, including by a covering walker.
create policy "walker reads messages to own clients" on messages for select
  using (exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid()));
drop policy "client sends messages" on messages;
create policy "client sends messages" on messages for insert
  with check (sender_id = auth.uid()
              and exists (select 1 from clients c where c.id = client_id and c.profile_id = auth.uid() and c.walker_id = messages.walker_id));
-- A walker can mark their client's messages read (only read_at; see guard).
create or replace function guard_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_operator() then
    if row(new.walker_id, new.client_id, new.walk_id, new.sender_id, new.kind, new.body, new.eta_minutes, new.sent_at)
       is distinct from row(old.walker_id, old.client_id, old.walk_id, old.sender_id, old.kind, old.body, old.eta_minutes, old.sent_at) then
      raise exception 'Only read status can be changed';
    end if;
  end if;
  return new;
end $$;
create policy "walker marks messages to own clients read" on messages for update
  using (exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid()))
  with check (exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid()));
