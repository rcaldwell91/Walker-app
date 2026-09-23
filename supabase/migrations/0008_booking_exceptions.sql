-- 0008 One-off changes to a repeating booking: skip a single day, or move that
-- one occurrence to another time. The series itself is untouched.
-- occurs_on is the original occurrence's date in the walker's time zone.

create table booking_exceptions (
  booking_id uuid not null references bookings (id) on delete cascade,
  walker_id uuid not null references walkers (id) on delete cascade,
  occurs_on date not null,
  skipped boolean not null default false,
  moved_to timestamptz,                  -- new start for this one occurrence
  duration_min int check (duration_min between 5 and 1440),
  created_at timestamptz not null default now(),
  primary key (booking_id, occurs_on),
  check (skipped <> (moved_to is not null))  -- exactly one of: skipped, moved
);
create index booking_exceptions_walker_idx on booking_exceptions (walker_id, moved_to);

alter table booking_exceptions enable row level security;

-- Same people who manage the booking manage its exceptions.
create policy "walker manages booking exceptions" on booking_exceptions for all
  using (exists (select 1 from bookings b where b.id = booking_id
                 and (b.walker_id = auth.uid() or b.covered_by_walker_id = auth.uid() or is_operator())))
  with check (walker_id = auth.uid() and exists (select 1 from bookings b where b.id = booking_id and b.walker_id = auth.uid()));
create policy "client reads own booking exceptions" on booking_exceptions for select
  using (exists (select 1 from bookings b where b.id = booking_id and b.client_id in (select my_client_ids())));
