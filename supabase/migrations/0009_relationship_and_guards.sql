-- 0009 Stage 5 (client relationship) plus guards on what each role may change.
--
-- Guards: RLS decides which ROWS someone may update; these triggers decide
-- which COLUMNS. auth.uid() is null for the service role (server-side admin
-- work), which is allowed through.

-- ---------------------------------------------------------------------------
-- Column guards
-- ---------------------------------------------------------------------------

-- Nobody promotes themselves (e.g. to operator).
create or replace function guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role and not is_operator() then
    raise exception 'Only the operator can change roles';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

-- Walkers can't verify their own background check or change their own status.
-- New proof resets verification so the operator reviews it again.
create or replace function guard_walker_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_operator() then
    new.status := old.status;
    new.background_check_verified_at :=
      case when new.background_check_path is distinct from old.background_check_path then null
           else old.background_check_verified_at end;
  end if;
  return new;
end $$;
create trigger walkers_guard before update on walkers
  for each row execute function guard_walker_update();

-- A client editing their own row may change contact details only.
create or replace function guard_client_self_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.profile_id = auth.uid() and old.walker_id <> auth.uid() and not is_operator() then
    if row(new.walker_id, new.profile_id, new.status, new.color, new.group_label)
       is distinct from row(old.walker_id, old.profile_id, old.status, old.color, old.group_label) then
      raise exception 'Clients can only change their own contact details';
    end if;
  end if;
  return new;
end $$;
create trigger clients_guard before update on clients
  for each row execute function guard_client_self_update();

-- A client may only mark a message read.
create or replace function guard_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.walker_id <> auth.uid() and not is_operator() then
    if row(new.walker_id, new.client_id, new.walk_id, new.sender_id, new.kind, new.body, new.eta_minutes, new.sent_at)
       is distinct from row(old.walker_id, old.client_id, old.walk_id, old.sender_id, old.kind, old.body, old.eta_minutes, old.sent_at) then
      raise exception 'Only read status can be changed';
    end if;
  end if;
  return new;
end $$;
create trigger messages_guard before update on messages
  for each row execute function guard_message_update();

-- A client may only fill in their answers.
create or replace function guard_check_in_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.walker_id <> auth.uid() and not is_operator() then
    if row(new.walker_id, new.client_id, new.due_at, new.sent_at, new.created_at)
       is distinct from row(old.walker_id, old.client_id, old.due_at, old.sent_at, old.created_at) then
      raise exception 'Only answers can be changed';
    end if;
  end if;
  return new;
end $$;
create trigger check_ins_guard before update on check_ins
  for each row execute function guard_check_in_update();

-- Tips start pending; only the operator (or the server) moves them on.
create or replace function guard_tip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_operator() then
    if tg_op = 'INSERT' then
      new.status := 'pending';
    elsif new.status is distinct from old.status or new.amount_cents is distinct from old.amount_cents then
      raise exception 'Tips can''t be changed once left';
    end if;
  end if;
  return new;
end $$;
create trigger tips_guard before insert or update on tips
  for each row execute function guard_tip();

-- ---------------------------------------------------------------------------
-- Walkers are no longer world-readable. The public profile page reads a
-- curated subset through public_walker_profile() below.
-- ---------------------------------------------------------------------------
drop policy "walker public read" on walkers;
create policy "walker reads self, clients read their walker" on walkers for select
  using (id = auth.uid() or is_operator()
         or id in (select walker_id from clients where profile_id = auth.uid()));

-- Everything the public profile shows, and nothing else. No client data.
create or replace function public_walker_profile(p_handle text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'handle', w.handle,
    'business_name', w.business_name,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'bio', w.bio,
    'service_area', w.service_area,
    'background_checked', w.background_check_verified_at is not null,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', st.name, 'category', st.category,
               'rate_cents', ws.rate_cents, 'duration_min', coalesce(ws.duration_min, st.default_duration_min))
             order by st.sort_order, st.name)
      from walker_services ws join service_types st on st.id = ws.service_type_id
      where ws.walker_id = w.id and ws.enabled), '[]'::jsonb),
    'rating_count', coalesce(r.rating_count, 0),
    'rating_avg', r.avg_score
  )
  from walkers w
  join profiles p on p.id = w.id
  left join walker_rating_summary r on r.walker_id = w.id
  where w.handle = p_handle and w.status = 'active';
$$;
grant execute on function public_walker_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Check-ins: worked out when a page loads, no cron. For each active client
-- (with a login) of the caller, or of the calling walker: if nothing is open
-- and a cadence has passed since the last check-in (or since they were
-- added), open one. Returns the caller's open check-ins.
-- ---------------------------------------------------------------------------
create or replace function open_due_check_ins(p_tz text default 'UTC')
returns setof check_ins language plpgsql security definer set search_path = public as $$
declare
  r record;
  last_due date;
  today date;
begin
  begin
    today := (now() at time zone p_tz)::date;
  exception when others then
    today := (now() at time zone 'UTC')::date;
  end;
  for r in
    select c.id as client_id, c.walker_id, c.created_at, w.check_in_cadence_days as cadence
    from clients c join walkers w on w.id = c.walker_id
    where c.status = 'active' and c.profile_id is not null
      and (c.profile_id = auth.uid() or c.walker_id = auth.uid())
  loop
    continue when exists (select 1 from check_ins where client_id = r.client_id and responded_at is null);
    select max(due_at) into last_due from check_ins where client_id = r.client_id;
    if coalesce(last_due, (r.created_at at time zone p_tz)::date) + r.cadence <= today then
      insert into check_ins (walker_id, client_id, due_at, sent_at) values (r.walker_id, r.client_id, today, now());
    end if;
  end loop;
  return query
    select * from check_ins
    where responded_at is null
      and (client_id in (select id from clients where profile_id = auth.uid()) or walker_id = auth.uid());
end $$;
grant execute on function open_due_check_ins(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Suggestions: a signed suggestion must name the sender's own client row
-- with this walker. Anonymous ones carry no client id (table check).
-- ---------------------------------------------------------------------------
drop policy "paying client submits suggestion" on suggestions;
create policy "paying client submits suggestion" on suggestions for insert
  with check (
    exists (select 1 from clients c join walkers w on w.id = c.walker_id
            where c.walker_id = suggestions.walker_id and c.profile_id = auth.uid()
              and c.status = 'active' and w.suggestion_box_enabled)
    and (is_anonymous
         or exists (select 1 from clients c where c.id = client_id and c.profile_id = auth.uid()
                    and c.walker_id = suggestions.walker_id))
  );

-- ---------------------------------------------------------------------------
-- Ratings: walkers rate only their own clients; clients rate their walker
-- once per finished walk their dog was on. Clients still never see ratings
-- about themselves (select policies from 0003 unchanged).
-- ---------------------------------------------------------------------------
drop policy "walker rates clients" on ratings;
create policy "walker rates clients" on ratings for insert
  with check (walker_id = auth.uid() and target = 'client' and rater_profile_id = auth.uid()
              and exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid()));

drop policy "client rates walker" on ratings;
create policy "client rates walker" on ratings for insert
  with check (
    target = 'walker' and rater_profile_id = auth.uid() and walk_id is not null
    and exists (select 1 from clients c where c.id = client_id and c.profile_id = auth.uid() and c.walker_id = ratings.walker_id)
    and exists (select 1 from walks w where w.id = walk_id and w.status = 'done' and w.walker_id = ratings.walker_id)
    and client_id in (select walk_client_ids(walk_id))
  );
create unique index ratings_once_per_walk on ratings (walk_id, rater_profile_id) where target = 'walker';

-- ---------------------------------------------------------------------------
-- Tips: recorded after a finished walk; one per walk per client.
-- ---------------------------------------------------------------------------
drop policy "client manages own tips" on tips;
create policy "client reads own tips" on tips for select using (client_id in (select my_client_ids()));
create policy "client tips after a walk" on tips for insert
  with check (
    walk_id is not null
    and exists (select 1 from clients c join walkers w on w.id = c.walker_id
                where c.id = client_id and c.profile_id = auth.uid() and c.walker_id = tips.walker_id and w.tips_enabled)
    and exists (select 1 from walks w where w.id = walk_id and w.status = 'done' and w.walker_id = tips.walker_id)
    and client_id in (select walk_client_ids(walk_id))
  );
create unique index tips_once_per_walk on tips (walk_id, client_id) where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Storage: clients can also open whole-group walk photos (no dog tagged)
-- from walks their dog was on. Matches the photos table policy.
-- ---------------------------------------------------------------------------
create policy "client reads group walk photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p
    where p.storage_path = name and p.dog_id is null and p.walk_id is not null
      and exists (select 1 from public.walk_client_ids(p.walk_id) c where c in (select public.my_client_ids()))));
