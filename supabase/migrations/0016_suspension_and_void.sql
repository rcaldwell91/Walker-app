-- 0016 Suspended walkers are locked out in the database, and sent invoices can be voided.

-- ---------------------------------------------------------------------------
-- Suspension. Paused walkers keep working (their public page is hidden);
-- suspended walkers can't read or write any client data, and can't take or be
-- asked for coverage. Done with RESTRICTIVE policies, which are ANDed with
-- every existing policy, so no existing policy had to change.
-- ---------------------------------------------------------------------------
create or replace function walker_is_suspended(p_walker uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from walkers where id = p_walker and status = 'suspended');
$$;

create or replace function i_am_suspended()
returns boolean language sql stable security definer set search_path = public as $$
  select walker_is_suspended(auth.uid());
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'client_invites', 'dogs', 'dog_notes', 'homework',
    'bookings', 'booking_dogs', 'booking_exceptions',
    'walks', 'walk_dogs', 'walk_events', 'gps_points', 'photos', 'incidents',
    'messages', 'check_ins', 'suggestions', 'ratings', 'tips',
    'coverage_approvals', 'coverage_approval_asks', 'coverage_requests',
    'invoices', 'invoice_lines', 'payments'
  ] loop
    execute format(
      'create policy "suspended walkers locked out" on %I as restrictive for all using (not i_am_suspended()) with check (not i_am_suspended())', t);
  end loop;
end $$;

-- Nobody can ask a suspended walker to cover.
create policy "no coverage requests to suspended walkers" on coverage_requests as restrictive for insert
  with check (not walker_is_suspended(to_walker_id));

-- Functions that bypass RLS get the same check.
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
  where (r.from_walker_id = auth.uid() or r.to_walker_id = auth.uid()) and not i_am_suspended();
$$;

create or replace function open_due_check_ins(p_tz text default 'UTC')
returns setof check_ins language plpgsql security definer set search_path = public as $$
declare
  r record;
  last_due date;
  today date;
begin
  if i_am_suspended() then return; end if;
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
      insert into check_ins (walker_id, client_id, due_at, sent_at) values (r.walker_id, r.client_id, today, now())
      on conflict (client_id) where responded_at is null do nothing;
    end if;
  end loop;
  return query
    select * from check_ins
    where responded_at is null
      and (client_id in (select id from clients where profile_id = auth.uid()) or walker_id = auth.uid());
end $$;

create or replace function reschedule_coverage(p_booking uuid, p_occurs_on date, p_starts_at timestamptz, p_duration int, p_skipped boolean)
returns table (request_id uuid, to_walker_id uuid, status coverage_status, change text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  d date;
begin
  if i_am_suspended() or not exists (select 1 from bookings where id = p_booking and walker_id = auth.uid()) then
    raise exception 'Not your booking';
  end if;
  perform set_config('app.coverage_system', 'on', true);
  for r in
    select * from coverage_requests
    where booking_id = p_booking and occurs_on = p_occurs_on and coverage_requests.status in ('open', 'accepted')
  loop
    if p_skipped then
      update coverage_requests set status = 'cancelled', cancelled_by = auth.uid() where id = r.id;
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

-- Suspending a walker cancels the upcoming covers they'd agreed to (or were
-- asked for), so the regular walker sees the day needs coverage again.
create or replace function cancel_covers_of_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'suspended' and old.status is distinct from 'suspended' then
    perform set_config('app.coverage_system', 'on', true);
    update coverage_requests set status = 'cancelled', cancelled_by = new.id
      where to_walker_id = new.id and status in ('open', 'accepted') and access_until > now();
    perform set_config('app.coverage_system', 'off', true);
  end if;
  return new;
end $$;
create trigger walkers_suspended_cancels_covers after update of status on walkers
  for each row execute function cancel_covers_of_suspended();

-- ---------------------------------------------------------------------------
-- Voiding a sent invoice. The client sees it as voided and owes nothing on it;
-- its walk lines go back to unbilled for the next invoice. Extras and
-- discounts stay with the voided invoice as its record. An invoice with
-- payments on it can't be voided (the money was received).
-- ---------------------------------------------------------------------------
alter table invoices add column void_total_cents int;

create or replace function guard_invoice_line()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  locked boolean;
begin
  if auth.uid() is null or is_operator() or current_setting('app.billing_system', true) = 'on' then
    return coalesce(new, old);
  end if;
  select exists (select 1 from invoices i where i.status <> 'draft'
                 and i.id in (case when tg_op <> 'INSERT' then old.invoice_id end, case when tg_op <> 'DELETE' then new.invoice_id end))
    into locked;
  if locked then raise exception 'Lines on a sent invoice can''t change'; end if;
  return coalesce(new, old);
end $$;

create or replace function void_invoice_before()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    if exists (select 1 from payments where invoice_id = new.id) then
      raise exception 'This invoice has payments recorded, so it can''t be voided';
    end if;
    new.void_total_cents := (select coalesce(sum(amount_cents), 0) from invoice_lines where invoice_id = new.id);
  end if;
  return new;
end $$;
create trigger invoices_void_before before update of status on invoices
  for each row execute function void_invoice_before();

create or replace function void_invoice_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    perform set_config('app.billing_system', 'on', true);
    update invoice_lines set invoice_id = null where invoice_id = new.id and kind = 'walk';
    perform set_config('app.billing_system', 'off', true);
  end if;
  return new;
end $$;
create trigger invoices_void_after after update of status on invoices
  for each row execute function void_invoice_after();
