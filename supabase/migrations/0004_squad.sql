-- 0004 Coverage squad: walkers link up; clients pre-approve who can cover; bookings get covered.

create type link_status as enum ('pending', 'accepted', 'declined', 'removed');
create type coverage_status as enum ('open', 'accepted', 'declined', 'cancelled');

-- A link between two walkers. Stored once, requester → recipient.
create table squad_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references walkers (id) on delete cascade,
  recipient_id uuid not null references walkers (id) on delete cascade,
  status link_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id),
  unique (requester_id, recipient_id)
);
create trigger squad_links_updated_at before update on squad_links
  for each row execute function set_updated_at();

-- Walker IDs in the current walker's accepted squad.
create or replace function my_squad_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select case when requester_id = auth.uid() then recipient_id else requester_id end
  from squad_links
  where status = 'accepted' and (requester_id = auth.uid() or recipient_id = auth.uid());
$$;

-- A client says "yes, this specific walker may cover for mine" (keys, home access).
create table coverage_approvals (
  client_id uuid not null references clients (id) on delete cascade,
  coverage_walker_id uuid not null references walkers (id) on delete cascade,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (client_id, coverage_walker_id)
);

-- "Can you take Dexter Tuesday?" → squad member accepts → booking.covered_by_walker_id set.
create table coverage_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  from_walker_id uuid not null references walkers (id) on delete cascade,
  to_walker_id uuid not null references walkers (id) on delete cascade,
  status coverage_status not null default 'open',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index coverage_requests_to_idx on coverage_requests (to_walker_id, status);
create index coverage_requests_booking_idx on coverage_requests (booking_id);

-- When a request is accepted, mark the booking covered — but only if the client approved this walker.
create or replace function apply_coverage_acceptance()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select client_id into cid from bookings where id = new.booking_id;
    if not exists (select 1 from coverage_approvals
                   where client_id = cid and coverage_walker_id = new.to_walker_id and revoked_at is null) then
      raise exception 'Client has not approved this walker for coverage';
    end if;
    update bookings set covered_by_walker_id = new.to_walker_id, status = 'scheduled'
      where id = new.booking_id;
    update coverage_requests set status = 'cancelled'
      where booking_id = new.booking_id and id <> new.id and status = 'open';
  end if;
  return new;
end $$;

create trigger coverage_request_accepted
  after update on coverage_requests
  for each row execute function apply_coverage_acceptance();

-- Covering walker can see the client + dogs for bookings they cover (read-only).
create policy "covering walker reads client" on clients for select
  using (exists (select 1 from bookings b where b.client_id = clients.id
                 and b.covered_by_walker_id = auth.uid() and b.status in ('scheduled','in_progress')));
create policy "covering walker reads dogs" on dogs for select
  using (exists (select 1 from bookings b join booking_dogs bd on bd.booking_id = b.id
                 where bd.dog_id = dogs.id and b.covered_by_walker_id = auth.uid()
                 and b.status in ('scheduled','in_progress')));

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table squad_links enable row level security;
alter table coverage_approvals enable row level security;
alter table coverage_requests enable row level security;

create policy "walkers see their links" on squad_links for select
  using (requester_id = auth.uid() or recipient_id = auth.uid() or is_operator());
create policy "walker requests link" on squad_links for insert with check (requester_id = auth.uid());
create policy "either side updates link" on squad_links for update
  using (requester_id = auth.uid() or recipient_id = auth.uid());

create policy "walker reads approvals for own clients" on coverage_approvals for select
  using (exists (select 1 from clients c where c.id = client_id and c.walker_id = auth.uid())
         or coverage_walker_id = auth.uid() or is_operator());
create policy "client manages own approvals" on coverage_approvals for all
  using (client_id in (select my_client_ids())) with check (client_id in (select my_client_ids()));

create policy "walker sees own coverage requests" on coverage_requests for select
  using (from_walker_id = auth.uid() or to_walker_id = auth.uid() or is_operator());
create policy "walker asks squad for coverage" on coverage_requests for insert
  with check (from_walker_id = auth.uid() and to_walker_id in (select my_squad_ids()));
create policy "either side updates request" on coverage_requests for update
  using (from_walker_id = auth.uid() or to_walker_id = auth.uid());
