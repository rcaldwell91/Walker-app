-- 0024 Choices that depend on how a walker runs their business are settings.
-- Defaults match what the app did before, so nothing changes until a walker
-- picks differently (Business settings page).

alter table walkers
  -- Boarding: the times a new booking starts with.
  add column boarding_dropoff_time time not null default '09:00',
  add column boarding_pickup_time time not null default '17:00',
  -- Boarding: an early pick-up bills the nights booked, or only the nights stayed.
  add column boarding_early_pickup text not null default 'booked' check (boarding_early_pickup in ('booked', 'actual')),
  -- Walk photos with no pets tagged: everyone on the walk sees them, or no one.
  add column untagged_photos_to_all boolean not null default true,
  -- How clients can pay (shown on their invoice; offered when recording a payment).
  add column payment_methods text[] not null default '{cash,venmo,zelle,check}'
    check (payment_methods <@ array['cash', 'venmo', 'zelle', 'check', 'other']),
  -- The tip amounts offered to clients, in dollars.
  add column tip_presets int[] not null default '{5,10,20}'
    check (array_length(tip_presets, 1) between 1 and 4 and 1 <= all (tip_presets) and 500 >= all (tip_presets)),
  -- Average driving speed for pickup ETAs (straight-line distance ÷ this), until road routing.
  add column eta_mph int not null default 25 check (eta_mph between 5 and 70);

-- Untagged walk photos follow the photo's walker's setting.
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
             and (select untagged_photos_to_all from walkers where id = p.walker_id)
             and exists (select 1 from walk_client_ids(p.walk_id) c where c in (select my_client_ids())))))));
$$;

-- Pick-up bills by the walker's early pick-up setting. With 'actual', an early
-- pick-up bills the nights stayed (at least one), and any hand-set difference
-- from the rates carries over as its own line. Otherwise the same as 0021.
create or replace function end_stay(p_stay uuid) returns text
language plpgsql security invoker set search_path = public as $$
declare
  s boarding_stays;
  names text[];
  rule text;
  local_end date;
  n int;           -- nights billed
  per_night int;   -- rate for all the stay's pets, one night
  target int;      -- what the stay comes to
begin
  select * into s from boarding_stays where id = p_stay and walker_id = auth.uid() for update;
  if s.id is null then raise exception 'That stay isn''t yours'; end if;
  if s.status = 'done' then return 'already done'; end if;
  if s.status = 'cancelled' then raise exception 'That stay was cancelled'; end if;

  select array_agg(d.name order by d.name) into names
    from stay_pets sp join dogs d on d.id = sp.dog_id where sp.stay_id = p_stay;
  if coalesce(array_length(names, 1), 0) = 0 then raise exception 'Add at least one pet to the stay'; end if;
  -- The bill is dated the day the pet actually went home (early pick-ups too), in the walker's zone.
  local_end := least(s.end_day, (now() at time zone coalesce((select time_zone from profiles where id = s.walker_id), 'UTC'))::date);
  select boarding_early_pickup into rule from walkers where id = s.walker_id;

  per_night := s.night_cents + s.extra_pet_cents * (array_length(names, 1) - 1);
  n := case when rule = 'actual' and local_end < s.end_day then greatest(1, local_end - s.start_day) else s.nights end;
  target := greatest(0, s.price_cents - (s.nights - n) * per_night);

  insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, quantity, unit_cents)
    values (s.walker_id, s.client_id, 'stay', s.id,
            format('Boarding · %s · %s night%s', names[1], n, case when n = 1 then '' else 's' end),
            local_end, n, s.night_cents);
  if array_length(names, 1) > 1 then
    insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, quantity, unit_cents)
      select s.walker_id, s.client_id, 'stay', s.id,
             format('Extra pet · %s · %s night%s', x, n, case when n = 1 then '' else 's' end),
             local_end, n, s.extra_pet_cents
      from unnest(names[2:]) x;
  end if;
  if target > n * per_night then
    insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, unit_cents)
      values (s.walker_id, s.client_id, 'extra', s.id, 'Boarding price adjustment', local_end, target - n * per_night);
  elsif target < n * per_night then
    insert into invoice_lines (walker_id, client_id, kind, stay_id, description, occurred_on, unit_cents)
      values (s.walker_id, s.client_id, 'discount', s.id, 'Boarding discount', local_end, target - n * per_night);
  end if;

  update boarding_stays set status = 'done', ended_at = now() where id = p_stay;
  return 'done';
end $$;
