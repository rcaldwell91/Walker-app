-- 0020 Boarding: overnight and multi-night stays at the walker's place.
--
-- A stay: one client, some of their pets, drop-off and pick-up. Nights are the
-- walker's local dates [start_day, end_day). Capacity is pets per night
-- (walkers.boarding_capacity); time off (walker_time_off) blocks dates.
-- One pet profile serves walking and boarding: boarding answers live in
-- dogs.boarding; emergency contact (existing) and "what I'm bringing" on the client.
-- Daily updates are a cut-down wrap-up (taps, ratings, photos, a note), one
-- per stay per day; owners see an update once it's posted. Ending a stay puts
-- it on the client's bill, like a finished walk.
-- Squad coverage for boarding is out of scope (docs/REDESIGN.md).

-- Settings and rates ---------------------------------------------------------
alter table walkers
  add column boarding_capacity int not null default 0 check (boarding_capacity between 0 and 100),
  add column boarding_night_cents int check (boarding_night_cents >= 0),
  add column boarding_extra_pet_cents int check (boarding_extra_pet_cents >= 0);

-- Intake ---------------------------------------------------------------------
-- dogs.boarding keys: feeding, meds_times, sleeps, crate, separation_anxiety,
-- alone, vet_release (boolean). See src/lib/boarding.ts.
alter table dogs add column boarding jsonb not null default '{}'::jsonb;
-- clients.emergency_contact already exists (0001); boarding uses it too.
alter table clients add column boarding_bringing text;

-- Stays ----------------------------------------------------------------------
create type stay_status as enum ('booked', 'done', 'cancelled');

create table boarding_stays (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  starts_at timestamptz not null,               -- drop-off
  ends_at timestamptz not null,                 -- pick-up
  start_day date not null,                      -- walker-local dates
  end_day date not null,
  nights int not null check (nights >= 1),
  night_cents int not null default 0,           -- rates when booked
  extra_pet_cents int not null default 0,
  price_cents int not null check (price_cents >= 0),
  notes text,
  status stay_status not null default 'booked',
  ended_at timestamptz,
  reminded_start_at timestamptz,                -- "starts tomorrow" sent
  reminded_end_at timestamptz,                  -- "ends tomorrow" sent
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (end_day > start_day)
);
create index boarding_stays_walker_idx on boarding_stays (walker_id, start_day);
create index boarding_stays_client_idx on boarding_stays (client_id, start_day desc);

create table stay_pets (
  stay_id uuid not null references boarding_stays (id) on delete cascade,
  dog_id uuid not null references dogs (id) on delete cascade,
  primary key (stay_id, dog_id)
);
create index stay_pets_dog_idx on stay_pets (dog_id);

create table stay_updates (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references boarding_stays (id) on delete cascade,
  walker_id uuid not null references walkers (id) on delete cascade,
  day date not null,
  note text,
  posted_at timestamptz,                        -- owners see it from here
  created_at timestamptz not null default now(),
  unique (stay_id, day)
);

create table stay_update_logs (
  update_id uuid not null references stay_updates (id) on delete cascade,
  dog_id uuid not null references dogs (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{1,30}$'),
  count int not null check (count between 1 and 20),
  primary key (update_id, dog_id, kind)
);

-- Ratings and photos on a daily update.
alter table pet_scores add column stay_update_id uuid references stay_updates (id) on delete cascade;
alter table pet_scores add constraint pet_scores_one_per_update unique (stay_update_id, dog_id, category);
alter table photos add column stay_update_id uuid references stay_updates (id) on delete cascade;
create index photos_stay_update_idx on photos (stay_update_id);

-- The walker's space, for the public profile and anyone looking at a stay.
create table walker_space_photos (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  storage_path text not null,                   -- avatars bucket (public)
  caption text,
  created_at timestamptz not null default now()
);
create index walker_space_photos_idx on walker_space_photos (walker_id, created_at);

-- Stays can be billed.
alter type invoice_line_kind add value if not exists 'stay';
alter table invoice_lines add column stay_id uuid references boarding_stays (id) on delete set null;
create index invoice_lines_stay_idx on invoice_lines (stay_id);

-- RLS -------------------------------------------------------------------------
create or replace function my_stay_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from boarding_stays where walker_id = auth.uid() and not i_am_suspended();
$$;
create or replace function client_stay_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from boarding_stays where client_id in (select my_client_ids()) and status <> 'cancelled';
$$;

alter table boarding_stays enable row level security;
create policy "walker manages own stays" on boarding_stays for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() and exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid()));
create policy "client reads own stays" on boarding_stays for select
  using (client_id in (select my_client_ids()) and status <> 'cancelled');

alter table stay_pets enable row level security;
create policy "walker manages stay pets" on stay_pets for all
  using (stay_id in (select my_stay_ids()) or is_operator())
  with check (stay_id in (select my_stay_ids())
              and exists (select 1 from boarding_stays s join dogs d on d.client_id = s.client_id
                          where s.id = stay_id and d.id = dog_id));
create policy "client reads own stay pets" on stay_pets for select using (stay_id in (select client_stay_ids()));

alter table stay_updates enable row level security;
create policy "walker manages stay updates" on stay_updates for all
  using (stay_id in (select my_stay_ids()) or is_operator())
  with check (walker_id = auth.uid() and stay_id in (select my_stay_ids()));
create policy "client reads posted updates" on stay_updates for select
  using (posted_at is not null and stay_id in (select client_stay_ids()));

alter table stay_update_logs enable row level security;
create policy "walker manages update logs" on stay_update_logs for all
  using (exists (select 1 from stay_updates u where u.id = update_id and u.stay_id in (select my_stay_ids())) or is_operator())
  with check (exists (select 1 from stay_updates u join stay_pets sp on sp.stay_id = u.stay_id
                      where u.id = update_id and sp.dog_id = stay_update_logs.dog_id and u.stay_id in (select my_stay_ids())));
create policy "client reads posted update logs" on stay_update_logs for select
  using (exists (select 1 from stay_updates u where u.id = update_id and u.posted_at is not null and u.stay_id in (select client_stay_ids())));

alter table walker_space_photos enable row level security;
create policy "walker manages own space photos" on walker_space_photos for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
-- Photos of the walker's space are public, like the public profile they're on.
create policy "anyone sees space photos" on walker_space_photos for select using (true);

do $$
declare t text;
begin
  foreach t in array array['boarding_stays', 'stay_pets', 'stay_updates', 'stay_update_logs'] loop
    execute format('create policy "suspended walkers locked out" on %I as restrictive for all using (not i_am_suspended()) with check (not i_am_suspended())', t);
  end loop;
end $$;

-- Ratings: on a walk (walk's pets) or on a daily update (the stay's pets).
drop policy "walker manages pet scores" on pet_scores;
create policy "walker manages pet scores" on pet_scores for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and ((walk_id is not null and stay_update_id is null
                    and exists (select 1 from walk_dogs wd join walks w on w.id = wd.walk_id
                                where wd.walk_id = pet_scores.walk_id and wd.dog_id = pet_scores.dog_id and w.walker_id = auth.uid()))
                or (stay_update_id is not null and walk_id is null
                    and exists (select 1 from stay_updates u join stay_pets sp on sp.stay_id = u.stay_id
                                where u.id = pet_scores.stay_update_id and sp.dog_id = pet_scores.dog_id and u.stay_id in (select my_stay_ids())))));
-- Owners see a daily update's ratings once it's posted.
drop policy "client reads own pets' scores" on pet_scores;
create policy "client reads own pets' scores" on pet_scores for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids()))
         and (stay_update_id is null or exists (select 1 from stay_updates u where u.id = stay_update_id and u.posted_at is not null)));

-- Photo tags: a walk's pets, or the stay's pets.
drop policy "walker tags own photos" on photo_pets;
create policy "walker tags own photos" on photo_pets for all
  using (exists (select 1 from photos p where p.id = photo_id and (p.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from photos p where p.id = photo_id and p.walker_id = auth.uid()
                      and (exists (select 1 from walk_dogs wd where wd.walk_id = p.walk_id and wd.dog_id = photo_pets.dog_id)
                           or exists (select 1 from stay_updates u join stay_pets sp on sp.stay_id = u.stay_id
                                      where u.id = p.stay_update_id and sp.dog_id = photo_pets.dog_id))));

-- Photos: the walker can only attach them to their own stay's update.
drop policy "walker manages photos" on photos;
create policy "walker manages photos" on photos for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and (walk_id is null or exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid()))
              and (stay_update_id is null or exists (select 1 from stay_updates u where u.id = stay_update_id and u.stay_id in (select my_stay_ids())))
              and (dog_id is null or exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid())
                   or dog_id in (select covering_dog_ids())));

-- Who sees a photo: walk photos once the walk is finished (0018); stay photos
-- once that day's update is posted, and only the stay's own client.
create or replace function client_can_see_photo(p_photo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos p
    where p.id = p_photo and (
      (p.stay_update_id is not null
       and exists (select 1 from stay_updates u where u.id = p.stay_update_id and u.posted_at is not null
                   and u.stay_id in (select client_stay_ids())))
      or
      (p.stay_update_id is null
       and (p.walk_id is null or exists (select 1 from walks w where w.id = p.walk_id and w.status = 'done'))
       and (
         exists (select 1 from dogs d where d.id = p.dog_id and d.client_id in (select my_client_ids()))
         or exists (select 1 from photo_pets pp join dogs d on d.id = pp.dog_id
                    where pp.photo_id = p.id and d.client_id in (select my_client_ids()))
         or (p.dog_id is null and p.walk_id is not null
             and not exists (select 1 from photo_pets pp where pp.photo_id = p.id)
             and exists (select 1 from walk_client_ids(p.walk_id) c where c in (select my_client_ids())))))));
$$;

-- Actions, each one transaction ----------------------------------------------

-- Post (or re-post) a day's update: replaces that day's taps and ratings.
create or replace function post_stay_update(
  p_update uuid,
  p_logs jsonb,     -- [{dog_id, kind, count}]
  p_scores jsonb,   -- [{dog_id, category, score}]
  p_tags jsonb,     -- [{photo_id, dog_ids: [..]}]
  p_note text
) returns timestamptz language plpgsql security invoker set search_path = public as $$
declare
  first_post boolean;
begin
  select posted_at is null into first_post from stay_updates where id = p_update and walker_id = auth.uid() for update;
  if first_post is null then raise exception 'That update isn''t yours'; end if;
  delete from stay_update_logs where update_id = p_update;
  insert into stay_update_logs (update_id, dog_id, kind, count)
    select p_update, (x ->> 'dog_id')::uuid, x ->> 'kind', (x ->> 'count')::int from jsonb_array_elements(p_logs) x;
  delete from pet_scores where stay_update_id = p_update;
  insert into pet_scores (walker_id, stay_update_id, dog_id, category, score)
    select auth.uid(), p_update, (x ->> 'dog_id')::uuid, x ->> 'category', (x ->> 'score')::smallint from jsonb_array_elements(p_scores) x;
  delete from photo_pets where photo_id in (select (x ->> 'photo_id')::uuid from jsonb_array_elements(p_tags) x);
  insert into photo_pets (photo_id, dog_id)
    select (x ->> 'photo_id')::uuid, d::uuid from jsonb_array_elements(p_tags) x, jsonb_array_elements_text(x -> 'dog_ids') d;
  update stay_updates set note = nullif(trim(p_note), ''), posted_at = coalesce(posted_at, now()) where id = p_update;
  return case when first_post then now() else null end;  -- null = an edit, not a new post
end $$;

-- Pick-up: the stay is done and goes on the client's bill (not yet invoiced).
-- Lines: the first pet × nights, each extra pet × nights, and any difference
-- the walker set by hand on the price.
create or replace function end_stay(p_stay uuid) returns text
language plpgsql security invoker set search_path = public as $$
declare
  s boarding_stays;
  names text[];
  computed int;
  local_end date;
begin
  select * into s from boarding_stays where id = p_stay and walker_id = auth.uid() for update;
  if s.id is null then raise exception 'That stay isn''t yours'; end if;
  if s.status = 'done' then return 'already done'; end if;
  if s.status = 'cancelled' then raise exception 'That stay was cancelled'; end if;

  select array_agg(d.name order by d.name) into names
    from stay_pets sp join dogs d on d.id = sp.dog_id where sp.stay_id = p_stay;
  if coalesce(array_length(names, 1), 0) = 0 then raise exception 'Add at least one pet to the stay'; end if;
  local_end := s.end_day;

  insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, quantity, unit_cents)
    values (s.walker_id, s.client_id, 'stay', s.id,
            format('Boarding · %s · %s night%s', names[1], s.nights, case when s.nights = 1 then '' else 's' end),
            local_end, s.nights, s.night_cents);
  if array_length(names, 1) > 1 then
    insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, quantity, unit_cents)
      select s.walker_id, s.client_id, 'stay', s.id,
             format('Extra pet · %s · %s night%s', n, s.nights, case when s.nights = 1 then '' else 's' end),
             local_end, s.nights, s.extra_pet_cents
      from unnest(names[2:]) n;
  end if;
  computed := s.nights * (s.night_cents + s.extra_pet_cents * (array_length(names, 1) - 1));
  if s.price_cents > computed then
    insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, unit_cents)
      values (s.walker_id, s.client_id, 'extra', s.id, 'Boarding price adjustment', local_end, s.price_cents - computed);
  elsif s.price_cents < computed then
    insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, unit_cents)
      values (s.walker_id, s.client_id, 'discount', s.id, 'Boarding discount', local_end, s.price_cents - computed);
  end if;

  update boarding_stays set status = 'done', ended_at = now() where id = p_stay;
  return 'done';
end $$;

-- "Starts tomorrow" / "ends tomorrow" reminders, claimed once each. Called on
-- page load (no cron); the caller sends the notifications.
create or replace function claim_stay_reminders(p_tomorrow date)
returns table (stay_id uuid, kind text, walker_id uuid, client_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
    update boarding_stays s set reminded_start_at = now()
    where s.status = 'booked' and s.reminded_start_at is null and s.start_day = p_tomorrow
      and (s.walker_id = auth.uid() or s.client_id in (select my_client_ids()))
    returning s.id, 'start'::text, s.walker_id, s.client_id;
  return query
    update boarding_stays s set reminded_end_at = now()
    where s.status = 'booked' and s.reminded_end_at is null and s.end_day = p_tomorrow
      and (s.walker_id = auth.uid() or s.client_id in (select my_client_ids()))
    returning s.id, 'end'::text, s.walker_id, s.client_id;
end $$;
