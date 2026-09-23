-- 0013 Notifications (in-app + Web Push), moving covers with moved days,
-- and walkers billing their own clients.
--
-- Billing is walker → client only. No card payments and no platform fee yet;
-- both are designed for (see notes at the bottom), not built.

-- ---------------------------------------------------------------------------
-- Profiles: time zone (so the database can reason about "which day"),
-- notification settings, home-screen install state
-- ---------------------------------------------------------------------------
alter table profiles
  add column time_zone text,
  add column notify_off text[] not null default '{}',   -- push kinds this person turned off
  add column app_installed_at timestamptz,
  add column install_guide_dismissed_at timestamptz;

-- ---------------------------------------------------------------------------
-- In-app notifications (every push is also a row here)
-- Written by the server (service role) only; each person reads their own.
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  url text not null default '/',
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on notifications (user_id, created_at desc);
alter table notifications enable row level security;
create policy "read own notifications" on notifications for select using (user_id = auth.uid());
create policy "mark own notifications read" on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Web Push subscriptions: private to their owner
-- ---------------------------------------------------------------------------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);
alter table push_subscriptions enable row level security;
create policy "manage own push subscriptions" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Check-ins get a push once, when they open.
alter table check_ins add column notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Moving (or skipping) a covered day moves (or cancels) the cover
-- ---------------------------------------------------------------------------
-- Called by the booking's walker after changing one occurrence. Open and
-- accepted requests for that occurrence follow it; if the new start falls
-- outside the old access window, the window is recalculated for the new day.
-- Returns what changed so the app can notify the covering walkers.
create or replace function reschedule_coverage(p_booking uuid, p_occurs_on date, p_starts_at timestamptz, p_duration int, p_skipped boolean)
returns table (request_id uuid, to_walker_id uuid, status coverage_status, change text)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  d date;
begin
  if not exists (select 1 from bookings where id = p_booking and walker_id = auth.uid()) then
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
revoke execute on function reschedule_coverage(uuid, date, timestamptz, int, boolean) from public, anon;
grant execute on function reschedule_coverage(uuid, date, timestamptz, int, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Billing: walkers bill their own clients
-- ---------------------------------------------------------------------------
create type billing_schedule as enum ('per_walk', 'weekly', 'monthly');
create type invoice_status as enum ('draft', 'sent', 'void');
create type invoice_line_kind as enum ('walk', 'extra', 'discount');
create type payment_method as enum ('cash', 'venmo', 'zelle', 'check', 'other');

alter table clients add column billing_schedule billing_schedule not null default 'monthly';
alter table walkers add column invoice_net_days int not null default 7 check (invoice_net_days between 0 and 120);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  number int not null,                       -- per walker: 1, 2, 3…
  status invoice_status not null default 'draft',
  period_start date not null,
  period_end date not null,
  issued_on date,
  due_on date,
  sent_at timestamptz,
  voided_at timestamptz,
  currency text not null default 'usd',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (walker_id, number),
  check (period_end >= period_start)
);
create index invoices_client_idx on invoices (client_id, created_at desc);
create trigger invoices_updated_at before update on invoices for each row execute function set_updated_at();

-- Lines exist before an invoice does: a finished walk is an unbilled line
-- (invoice_id null) until the next invoice for that client picks it up.
create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  invoice_id uuid references invoices (id) on delete set null,
  kind invoice_line_kind not null,
  walk_id uuid references walks (id) on delete set null,
  service_type_id uuid references service_types (id) on delete set null,
  description text not null,
  occurred_on date not null,
  quantity numeric(8, 2) not null default 1 check (quantity > 0),
  unit_cents int not null,
  amount_cents int generated always as (round(quantity * unit_cents)::int) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'discount' and unit_cents <= 0) or (kind <> 'discount' and unit_cents >= 0))
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id);
create index invoice_lines_unbilled_idx on invoice_lines (client_id, occurred_on) where invoice_id is null;
create unique index invoice_lines_one_per_walk on invoice_lines (walk_id, client_id) where kind = 'walk';
create trigger invoice_lines_updated_at before update on invoice_lines for each row execute function set_updated_at();

create table payments (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  invoice_id uuid not null references invoices (id) on delete cascade,
  amount_cents int not null check (amount_cents > 0),
  method payment_method not null,
  received_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index payments_invoice_idx on payments (invoice_id);
create index payments_walker_idx on payments (walker_id, received_on desc);

-- Invoice numbers count up per walker.
create or replace function number_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('invoice_number:' || new.walker_id::text));
  select coalesce(max(number), 0) + 1 into new.number from invoices where walker_id = new.walker_id;
  return new;
end $$;
create trigger invoices_number before insert on invoices for each row execute function number_invoice();

-- Sent invoices are final (void and redo instead). Status only moves forward.
create or replace function guard_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_operator() then return new; end if;
  if new.walker_id <> old.walker_id or new.client_id <> old.client_id or new.number <> old.number then
    raise exception 'An invoice''s walker, client and number can''t change';
  end if;
  if old.status <> 'draft' and row(new.period_start, new.period_end, new.issued_on, new.due_on, new.sent_at, new.notes)
     is distinct from row(old.period_start, old.period_end, old.issued_on, old.due_on, old.sent_at, old.notes) then
    raise exception 'A sent invoice can''t be edited';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'draft' and new.status in ('sent', 'void')) or (old.status = 'sent' and new.status = 'void')) then
    raise exception 'That status change isn''t allowed';
  end if;
  if new.status = 'sent' and old.status = 'draft' then
    new.sent_at := now();
    new.issued_on := coalesce(new.issued_on, current_date);
    new.due_on := coalesce(new.due_on, new.issued_on + (select invoice_net_days from walkers where id = new.walker_id));
  end if;
  if new.status = 'void' and old.status <> 'void' then new.voided_at := now(); end if;
  return new;
end $$;
create trigger invoices_guard before update on invoices for each row execute function guard_invoice();

-- Lines on a sent or void invoice are locked.
create or replace function guard_invoice_line()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  locked boolean;
begin
  if auth.uid() is null or is_operator() then return coalesce(new, old); end if;
  select exists (select 1 from invoices i where i.status <> 'draft'
                 and i.id in (case when tg_op <> 'INSERT' then old.invoice_id end, case when tg_op <> 'DELETE' then new.invoice_id end))
    into locked;
  if locked then raise exception 'Lines on a sent invoice can''t change'; end if;
  return coalesce(new, old);
end $$;
create trigger invoice_lines_guard before insert or update or delete on invoice_lines
  for each row execute function guard_invoice_line();

-- A finished walk becomes one line per client whose dogs were on it, billed by
-- that client's own walker at their rate for the service. So a covered walk
-- bills through the regular walker, not the one who covered.
create or replace function bill_finished_walk()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    insert into invoice_lines (walker_id, client_id, kind, walk_id, service_type_id, description, occurred_on, unit_cents)
    select c.walker_id, c.id, 'walk', new.id, new.service_type_id,
           concat_ws(' · ', st.name, string_agg(d.name, ', ' order by d.name)),
           (coalesce(new.started_at, now()) at time zone coalesce(p.time_zone, 'UTC'))::date,
           coalesce(ws.rate_cents, 0)
    from walk_dogs wd
    join dogs d on d.id = wd.dog_id
    join clients c on c.id = d.client_id
    join profiles p on p.id = c.walker_id
    left join service_types st on st.id = new.service_type_id
    left join walker_services ws on ws.walker_id = c.walker_id and ws.service_type_id = new.service_type_id
    where wd.walk_id = new.id
    group by c.walker_id, c.id, st.name, p.time_zone, ws.rate_cents
    on conflict (walk_id, client_id) where kind = 'walk' do nothing;
  end if;
  return new;
end $$;
create trigger walks_bill_when_done after update on walks for each row execute function bill_finished_walk();

-- Walks finished before billing existed become unbilled lines too.
insert into invoice_lines (walker_id, client_id, kind, walk_id, service_type_id, description, occurred_on, unit_cents)
select c.walker_id, c.id, 'walk', w.id, w.service_type_id,
       concat_ws(' · ', st.name, string_agg(d.name, ', ' order by d.name)),
       (coalesce(w.started_at, w.created_at) at time zone coalesce(p.time_zone, 'UTC'))::date,
       coalesce(ws.rate_cents, 0)
from walks w
join walk_dogs wd on wd.walk_id = w.id
join dogs d on d.id = wd.dog_id
join clients c on c.id = d.client_id
join profiles p on p.id = c.walker_id
left join service_types st on st.id = w.service_type_id
left join walker_services ws on ws.walker_id = c.walker_id and ws.service_type_id = w.service_type_id
where w.status = 'done'
group by w.id, c.walker_id, c.id, st.name, p.time_zone, ws.rate_cents
on conflict (walk_id, client_id) where kind = 'walk' do nothing;

-- RLS. Walkers: their own clients only (never a client they're covering for).
-- Clients: their own invoices once sent, with lines and payments.
alter table invoices enable row level security;
alter table invoice_lines enable row level security;
alter table payments enable row level security;

create policy "walker manages own invoices" on invoices for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() and exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid()));
create policy "client reads own sent invoices" on invoices for select
  using (client_id in (select my_client_ids()) and status <> 'draft');

create policy "walker manages own invoice lines" on invoice_lines for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid())
              and (invoice_id is null or exists (select 1 from invoices i where i.id = invoice_id and i.walker_id = auth.uid() and i.client_id = invoice_lines.client_id)));
create policy "client reads lines on own sent invoices" on invoice_lines for select
  using (invoice_id in (select id from invoices where client_id in (select my_client_ids()) and status <> 'draft'));

create policy "walker records own payments" on payments for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid()
              and exists (select 1 from invoices i where i.id = invoice_id and i.walker_id = auth.uid()
                          and i.client_id = payments.client_id and i.status = 'sent'));
create policy "client reads own payments" on payments for select using (client_id in (select my_client_ids()));

-- Later, without reworking these tables:
--   card payments: add 'card' to payment_method, plus nullable provider columns on payments;
--   platform fee:  add 'platform_fee' to invoice_line_kind (a separate, visible line).
