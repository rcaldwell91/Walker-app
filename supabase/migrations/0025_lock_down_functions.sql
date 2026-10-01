-- 0025 Lock down database functions exposed over the REST API.
--
-- Every function in `public` can be called at /rest/v1/rpc/<name>, and Postgres
-- grants EXECUTE to PUBLIC by default, so revoking from `anon` alone does nothing.
-- We revoke from everyone, then grant back exactly what each group needs.
--
--   1. Trigger functions: only ever fired by triggers. No one gets EXECUTE
--      (Postgres doesn't check EXECUTE when a trigger fires).
--   2. Helpers about the caller (no argument, everything from auth.uid()):
--      used inside RLS policies, so signed-in users keep them. Anonymous callers don't.
--   3. Helpers that take an ID: kept for signed-in users (policies call them
--      with row values), but each now answers only for rows the caller is
--      entitled to. Details at each function below.
--   4. claim_stay_reminders, reschedule_coverage: change data for a given person,
--      so service role only. They take the acting person explicitly
--      (p_actor) and the server passes the signed-in user's id.
--   5. public_walker_profile: public by design (the logged-out profile page).
-- Plus: walker_rating_summary becomes security_invoker with no direct grants,
-- and set_updated_at gets a fixed search_path.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- 3. Helpers that take an ID: answer only about what the caller may know -------

-- Clients on a walk. The walk's walker (and the operator) get the full list;
-- anyone else gets only clients that are theirs (their own client rows, or
-- clients they walk for). Policies use it as "is one of my clients on this
-- walk", which this still answers; it no longer lists other people's clients.
create or replace function walk_client_ids(w uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select distinct d.client_id
  from walk_dogs wd join dogs d on d.id = wd.dog_id
  where wd.walk_id = w
    and (is_operator()
         or exists (select 1 from walks wk where wk.id = w and wk.walker_id = auth.uid())
         or d.client_id in (select my_client_ids())
         or d.walker_id = auth.uid());
$$;

-- A walker's squad: the full list only for that walker, the operator, or that
-- walker's own clients (who choose backup walkers from it). A squad member
-- asking about someone else's squad learns only whether they themself are in
-- it (the coverage guard checks exactly that when they accept a cover).
create or replace function squad_ids_of(w uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select m from (
    select case when requester_id = w then recipient_id else requester_id end as m
    from squad_links
    where status = 'accepted' and (requester_id = w or recipient_id = w)
  ) s
  where w = auth.uid() or is_operator() or s.m = auth.uid()
     or exists (select 1 from clients c where c.profile_id = auth.uid() and c.walker_id = w);
$$;

-- Is a walker suspended: only for themself, the operator, their squad (who may
-- ask them to cover) and their own clients. Anyone else gets "no".
create or replace function walker_is_suspended(p_walker uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from walkers where id = p_walker and status = 'suspended')
     and (p_walker = auth.uid() or is_operator()
          or p_walker in (select my_squad_ids())
          or exists (select 1 from clients c where c.profile_id = auth.uid() and c.walker_id = p_walker));
$$;

-- 4. Service role only, acting person passed in --------------------------------

drop function claim_stay_reminders(date);
create function claim_stay_reminders(p_actor uuid, p_tomorrow date)
returns table (stay_id uuid, kind text, walker_id uuid, client_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query
    update boarding_stays s set reminded_start_at = now()
    where s.status = 'booked' and s.reminded_start_at is null and s.start_day = p_tomorrow
      and (s.walker_id = p_actor or s.client_id in (select id from clients where profile_id = p_actor))
    returning s.id, 'start'::text, s.walker_id, s.client_id;
  return query
    update boarding_stays s set reminded_end_at = now()
    where s.status = 'booked' and s.reminded_end_at is null and s.end_day = p_tomorrow
      and (s.walker_id = p_actor or s.client_id in (select id from clients where profile_id = p_actor))
    returning s.id, 'end'::text, s.walker_id, s.client_id;
end $$;

drop function reschedule_coverage(uuid, date, timestamptz, integer, boolean);
create function reschedule_coverage(p_actor uuid, p_booking uuid, p_occurs_on date, p_starts_at timestamptz, p_duration integer, p_skipped boolean)
returns table (request_id uuid, to_walker_id uuid, status coverage_status, change text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  d date;
begin
  if exists (select 1 from walkers where id = p_actor and walkers.status = 'suspended')
     or not exists (select 1 from bookings where id = p_booking and walker_id = p_actor) then
    raise exception 'Not your booking';
  end if;
  perform set_config('app.coverage_system', 'on', true);
  for r in
    select * from coverage_requests
    where booking_id = p_booking and occurs_on = p_occurs_on and coverage_requests.status in ('open', 'accepted')
  loop
    if p_skipped then
      update coverage_requests set status = 'cancelled', cancelled_by = p_actor where id = r.id;
      request_id := r.id; to_walker_id := r.to_walker_id; status := r.status; change := 'cancelled';
      return next;
    elsif p_starts_at is distinct from r.starts_at or coalesce(p_duration, r.duration_min) is distinct from r.duration_min then
      if p_starts_at < r.access_from or p_starts_at >= r.access_until then
        d := (p_starts_at at time zone r.tz)::date;
        update coverage_requests
          set starts_at = p_starts_at, duration_min = coalesce(p_duration, duration_min),
              access_from = (d - 1)::timestamp at time zone r.tz,
              access_until = (d + 1)::timestamp at time zone r.tz
          where id = r.id;
      else
        update coverage_requests set starts_at = p_starts_at, duration_min = coalesce(p_duration, duration_min) where id = r.id;
      end if;
      request_id := r.id; to_walker_id := r.to_walker_id; status := r.status; change := 'moved';
      return next;
    end if;
  end loop;
  perform set_config('app.coverage_system', 'off', true);
end $$;

revoke execute on function claim_stay_reminders(uuid, date) from public, anon, authenticated;
revoke execute on function reschedule_coverage(uuid, uuid, date, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function claim_stay_reminders(uuid, date) to service_role;
grant execute on function reschedule_coverage(uuid, uuid, date, timestamptz, integer, boolean) to service_role;

-- 2 and 3. Signed-in users only -----------------------------------------------
grant execute on function
  is_operator(), my_client_ids(), my_stay_ids(), my_squad_ids(), i_am_suspended(),
  covering_client_ids(), covering_dog_ids(), walks_with_my_dogs(), client_stay_ids(),
  current_role_is(user_role), client_squad_choices(), my_coverage(), squad_overview(),
  open_due_check_ins(text),
  walk_client_ids(uuid), squad_ids_of(uuid), walker_is_suspended(uuid),
  client_can_see_photo(uuid), walker_can_see_covered_photo(uuid), walk_walker_name(uuid),
  find_walker_by_handle(text),
  -- invoker functions (RLS applies): one transaction per user action
  finish_walk(uuid, jsonb, jsonb, jsonb, jsonb, text, integer, integer, integer, timestamptz),
  post_stay_update(uuid, jsonb, jsonb, jsonb, text),
  end_stay(uuid)
to authenticated;

-- 5. Public by design ----------------------------------------------------------
grant execute on function public_walker_profile(text) to anon, authenticated;

-- The rating summary: read only inside public_walker_profile() and
-- squad_overview(), which run as the owner. As security_invoker with no grants,
-- it is no longer a way to list walkers or read ratings directly.
alter view walker_rating_summary set (security_invoker = true);
revoke all on walker_rating_summary from public, anon, authenticated;

alter function set_updated_at() set search_path = public;
