-- 0017 The walk in three stages, per-pet wrap-up, parks with attributes, time off.
--
-- A walk is: before (picking up) → walking → wrap-up → done.
--   walking_at: the walker tapped "Start walking" (all pets picked up).
--   wrapup_at:  the walker tapped "End walk". The walk's end time is this,
--               not when they finish the wrap-up form.
-- Wrap-up writes everything at "Finish": one-tap logs (walk_events), quick
-- ratings (pet_scores), "working on" (dogs + a snapshot on walk_dogs), and
-- which pets each photo shows (photo_pets).

alter table walks add column walking_at timestamptz, add column wrapup_at timestamptz;

-- What each pet was working on, as of this walk (dogs.working_on keeps changing).
alter table walk_dogs add column working_on text;

-- Walks log the same things everywhere now: fed and meds too.
update service_types set log_buttons = '["poop","pee","water","treat","fed","meds"]'::jsonb
  where walker_id is null and key in ('group_walk', 'private_walk');

-- ---------------------------------------------------------------------------
-- Quick ratings per pet, 1-5. Categories live in the app (src/lib/pet-scores.ts)
-- so adding one is a code change, not a migration.
-- ---------------------------------------------------------------------------
create table pet_scores (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  walk_id uuid references walks (id) on delete cascade,
  dog_id uuid not null references dogs (id) on delete cascade,
  category text not null check (category ~ '^[a-z_]{1,40}$'),
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now()
);
create unique index pet_scores_one_per_walk on pet_scores (walk_id, dog_id, category) where walk_id is not null;
create index pet_scores_dog_idx on pet_scores (dog_id, created_at desc);

alter table pet_scores enable row level security;
-- The walker who walked them (own pets, or covered pets on their own walk).
create policy "walker manages pet scores" on pet_scores for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and (walk_id is null or exists (select 1 from walk_dogs wd join walks w on w.id = wd.walk_id
                                              where wd.walk_id = pet_scores.walk_id and wd.dog_id = pet_scores.dog_id and w.walker_id = auth.uid())));
-- The owner.
create policy "client reads own pets' scores" on pet_scores for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));
-- The pet's own walker, when someone else covered.
create policy "walker reads own pets' scores" on pet_scores for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()));
create policy "suspended walkers locked out" on pet_scores as restrictive for all
  using (not i_am_suspended()) with check (not i_am_suspended());

-- ---------------------------------------------------------------------------
-- Photos tagged with pets. A photo with tags is seen by those pets' owners only.
-- A photo with no tags (and no legacy dog_id) is a group photo: everyone whose
-- pet was on the walk sees it.
-- ---------------------------------------------------------------------------
create table photo_pets (
  photo_id uuid not null references photos (id) on delete cascade,
  dog_id uuid not null references dogs (id) on delete cascade,
  primary key (photo_id, dog_id)
);
create index photo_pets_dog_idx on photo_pets (dog_id);

-- Visibility is decided here, as the definer, so a client can't infer "untagged"
-- just because the tags for other people's pets are hidden from them.
create or replace function client_can_see_photo(p_photo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from photos p
    where p.id = p_photo and (
      exists (select 1 from dogs d where d.id = p.dog_id and d.client_id in (select my_client_ids()))
      or exists (select 1 from photo_pets pp join dogs d on d.id = pp.dog_id
                 where pp.photo_id = p.id and d.client_id in (select my_client_ids()))
      or (p.dog_id is null and p.walk_id is not null
          and not exists (select 1 from photo_pets pp where pp.photo_id = p.id)
          and exists (select 1 from walk_client_ids(p.walk_id) c where c in (select my_client_ids())))));
$$;

-- The regular walker, for a walk someone else covered: photos of their own pets,
-- or group photos.
create or replace function walker_can_see_covered_photo(p_photo uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select not i_am_suspended() and exists (
    select 1 from photos p
    where p.id = p_photo and p.walk_id in (select walks_with_my_dogs()) and (
      exists (select 1 from dogs d where d.id = p.dog_id and d.walker_id = auth.uid())
      or exists (select 1 from photo_pets pp join dogs d on d.id = pp.dog_id
                 where pp.photo_id = p.id and d.walker_id = auth.uid())
      or (p.dog_id is null and not exists (select 1 from photo_pets pp where pp.photo_id = p.id))));
$$;

alter table photo_pets enable row level security;
create policy "walker tags own photos" on photo_pets for all
  using (exists (select 1 from photos p where p.id = photo_id and (p.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from photos p join walk_dogs wd on wd.walk_id = p.walk_id
                      where p.id = photo_id and p.walker_id = auth.uid() and wd.dog_id = photo_pets.dog_id));
create policy "client reads own pets' tags" on photo_pets for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));
create policy "walker reads own pets' tags" on photo_pets for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.walker_id = auth.uid()));
create policy "suspended walkers locked out" on photo_pets as restrictive for all
  using (not i_am_suspended()) with check (not i_am_suspended());

drop policy "client reads own dogs' photos" on photos;
create policy "client reads own pets' photos" on photos for select using (client_can_see_photo(id));
drop policy "walker reads photos of own dogs" on photos;
create policy "walker reads photos of own pets" on photos for select using (walker_can_see_covered_photo(id));

drop policy "client reads dog photos" on storage.objects;
drop policy "client reads group walk photos" on storage.objects;
create policy "client reads walk photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p where p.storage_path = storage.objects.name and public.client_can_see_photo(p.id)));
drop policy "walker reads covered walk photos" on storage.objects;
create policy "walker reads covered walk photos" on storage.objects for select
  using (bucket_id = 'photos' and exists (
    select 1 from public.photos p where p.storage_path = storage.objects.name and public.walker_can_see_covered_photo(p.id)));

-- ---------------------------------------------------------------------------
-- Parks and trails (the trails table): attributes the walker sets, and an address.
-- features holds keys from src/lib/parks.ts: shade, off_leash, paved, water,
-- parking, bathroom, fenced, rain.
-- ---------------------------------------------------------------------------
alter table trails add column features text[] not null default '{}', add column address text;
update trails set features = array['rain'] where good_for_rain;

-- ---------------------------------------------------------------------------
-- Time off: dates the walker is away. Boarding uses it too.
-- ---------------------------------------------------------------------------
create table walker_time_off (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index walker_time_off_idx on walker_time_off (walker_id, starts_on);
alter table walker_time_off enable row level security;
create policy "walker manages own time off" on walker_time_off for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
