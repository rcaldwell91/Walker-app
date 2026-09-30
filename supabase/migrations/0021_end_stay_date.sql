-- 0021 A stay's bill is dated the actual pick-up day, so "Bill now" (lines up to
-- today) picks up an early pick-up too. Same function as 0020 otherwise.

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
  -- The bill is dated the day the pet actually went home (early pick-ups too), in the walker's zone.
  local_end := least(s.end_day, (now() at time zone coalesce((select time_zone from profiles where id = s.walker_id), 'UTC'))::date);

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
