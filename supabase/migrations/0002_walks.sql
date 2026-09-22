-- 0002 The walk itself: schedule, walks, tap-button events, GPS, notes, incidents, homework, photos, messages.

create type booking_status as enum ('scheduled', 'in_progress', 'done', 'cancelled', 'needs_coverage');
create type walk_status as enum ('planned', 'in_progress', 'done', 'cancelled');
create type note_source as enum ('voice', 'typed');
create type incident_severity as enum ('minor', 'moderate', 'serious');
create type homework_status as enum ('assigned', 'in_progress', 'done');
create type message_kind as enum ('on_my_way', 'here', 'picked_up', 'dropped_off', 'custom');

-- ---------------------------------------------------------------------------
-- Bookings: the schedule. One booking = one client, one service, one time.
-- Recurrence is a simple weekly pattern; expanded into bookings by the app.
-- ---------------------------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  service_type_id uuid not null references service_types (id),
  starts_at timestamptz not null,
  duration_min int not null default 60,
  -- Weekly recurrence: array of ISO weekday numbers (1=Mon..7=Sun). Empty = one-off.
  repeat_weekdays smallint[] not null default '{}',
  repeat_until date,
  status booking_status not null default 'scheduled',
  -- Set when a squad member is covering this booking.
  covered_by_walker_id uuid references walkers (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_walker_time_idx on bookings (walker_id, starts_at);
create index bookings_client_idx on bookings (client_id);
create index bookings_cover_idx on bookings (covered_by_walker_id);
create trigger bookings_updated_at before update on bookings
  for each row execute function set_updated_at();

create table booking_dogs (
  booking_id uuid not null references bookings (id) on delete cascade,
  dog_id uuid not null references dogs (id) on delete cascade,
  primary key (booking_id, dog_id)
);

-- ---------------------------------------------------------------------------
-- Walks: what actually happened. A group walk has many dogs from many clients.
-- ---------------------------------------------------------------------------
create table walks (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  service_type_id uuid not null references service_types (id),
  trail_id uuid references trails (id) on delete set null,
  status walk_status not null default 'planned',
  started_at timestamptz,
  ended_at timestamptz,
  -- Pickup route the app calculated: ordered client ids.
  pickup_order uuid[] not null default '{}',
  distance_m int,
  drive_minutes int,
  walk_minutes int,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index walks_walker_time_idx on walks (walker_id, started_at desc);
create trigger walks_updated_at before update on walks
  for each row execute function set_updated_at();

create table walk_dogs (
  walk_id uuid not null references walks (id) on delete cascade,
  dog_id uuid not null references dogs (id) on delete cascade,
  booking_id uuid references bookings (id) on delete set null,
  picked_up_at timestamptz,
  dropped_off_at timestamptz,
  primary key (walk_id, dog_id)
);
create index walk_dogs_dog_idx on walk_dogs (dog_id);

-- Client IDs whose dogs are on a given walk (for client-side RLS).
create or replace function walk_client_ids(w uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct d.client_id from walk_dogs wd join dogs d on d.id = wd.dog_id where wd.walk_id = w;
$$;

-- One-tap events: poop, pee, water, fed, meds, plants, trash... plus pickup/dropoff.
create table walk_events (
  id uuid primary key default gen_random_uuid(),
  walk_id uuid not null references walks (id) on delete cascade,
  dog_id uuid references dogs (id) on delete cascade,   -- null = whole group
  kind text not null,                                    -- matches service_types.log_buttons keys
  note text,
  at timestamptz not null default now(),
  lat double precision,
  lng double precision
);
create index walk_events_walk_idx on walk_events (walk_id, at);

-- GPS breadcrumbs. Written in batches from the phone; queued offline.
create table gps_points (
  walk_id uuid not null references walks (id) on delete cascade,
  at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  primary key (walk_id, at)
);

-- ---------------------------------------------------------------------------
-- Dog notes: progress and general notes, usually spoken.
-- ---------------------------------------------------------------------------
create table dog_notes (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  walker_id uuid not null references walkers (id) on delete cascade,
  walk_id uuid references walks (id) on delete set null,
  body text not null,
  source note_source not null default 'typed',
  raw_transcript text,                 -- what the mic heard, before cleanup
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now()
);
create index dog_notes_dog_idx on dog_notes (dog_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Incident reports: quick, structured.
-- ---------------------------------------------------------------------------
create table incidents (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  walk_id uuid references walks (id) on delete set null,
  dog_id uuid references dogs (id) on delete set null,
  severity incident_severity not null default 'minor',
  what_happened text not null,
  action_taken text,
  occurred_at timestamptz not null default now(),
  client_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index incidents_walker_idx on incidents (walker_id, occurred_at desc);
create index incidents_dog_idx on incidents (dog_id);

-- ---------------------------------------------------------------------------
-- Homework for clients: "work on wait and stay at home."
-- ---------------------------------------------------------------------------
create table homework (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references dogs (id) on delete cascade,
  walker_id uuid not null references walkers (id) on delete cascade,
  title text not null,
  instructions text,
  status homework_status not null default 'assigned',
  due_at date,
  client_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index homework_dog_idx on homework (dog_id);
create trigger homework_updated_at before update on homework
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Photos: stored in the 'photos' bucket at {walker_id}/{walk_id or 'misc'}/{uuid}.jpg
-- ---------------------------------------------------------------------------
create table photos (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  walk_id uuid references walks (id) on delete set null,
  dog_id uuid references dogs (id) on delete set null,
  storage_path text not null,
  caption text,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);
create index photos_walk_idx on photos (walk_id);
create index photos_dog_idx on photos (dog_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Messages: one-tap status messages to clients, plus custom ones.
-- SMS delivery comes with Twilio later; in-app delivery works now.
-- ---------------------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  walk_id uuid references walks (id) on delete set null,
  sender_id uuid not null references profiles (id),
  kind message_kind not null default 'custom',
  body text not null,
  eta_minutes int,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_client_idx on messages (client_id, sent_at desc);
create index messages_walker_idx on messages (walker_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table bookings enable row level security;
alter table booking_dogs enable row level security;
alter table walks enable row level security;
alter table walk_dogs enable row level security;
alter table walk_events enable row level security;
alter table gps_points enable row level security;
alter table dog_notes enable row level security;
alter table incidents enable row level security;
alter table homework enable row level security;
alter table photos enable row level security;
alter table messages enable row level security;

-- bookings: walker (or covering walker) manages; client reads own
create policy "walker manages bookings" on bookings for all
  using (walker_id = auth.uid() or covered_by_walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() or covered_by_walker_id = auth.uid() or is_operator());
create policy "client reads own bookings" on bookings for select
  using (client_id in (select my_client_ids()));

create policy "booking_dogs via booking" on booking_dogs for all
  using (exists (select 1 from bookings b where b.id = booking_id
                 and (b.walker_id = auth.uid() or b.covered_by_walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from bookings b where b.id = booking_id
                 and (b.walker_id = auth.uid() or b.covered_by_walker_id = auth.uid())));
create policy "client reads own booking_dogs" on booking_dogs for select
  using (exists (select 1 from bookings b where b.id = booking_id and b.client_id in (select my_client_ids())));

-- walks
create policy "walker manages walks" on walks for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
create policy "client reads walks with their dogs" on walks for select
  using (exists (select 1 from walk_client_ids(id) c where c in (select my_client_ids())));

create policy "walk_dogs via walk" on walk_dogs for all
  using (exists (select 1 from walks w where w.id = walk_id and (w.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid()));
create policy "client reads own walk_dogs" on walk_dogs for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));

create policy "walk_events via walk" on walk_events for all
  using (exists (select 1 from walks w where w.id = walk_id and (w.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid()));
create policy "client reads own dogs' events" on walk_events for select
  using (dog_id is null and exists (select 1 from walk_client_ids(walk_id) c where c in (select my_client_ids()))
         or exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));

create policy "gps via walk" on gps_points for all
  using (exists (select 1 from walks w where w.id = walk_id and (w.walker_id = auth.uid() or is_operator())))
  with check (exists (select 1 from walks w where w.id = walk_id and w.walker_id = auth.uid()));
create policy "client reads gps for their walks" on gps_points for select
  using (exists (select 1 from walk_client_ids(walk_id) c where c in (select my_client_ids())));

-- notes
create policy "walker manages notes" on dog_notes for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
create policy "client reads visible notes" on dog_notes for select
  using (visible_to_client and exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));

-- incidents
create policy "walker manages incidents" on incidents for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
create policy "client reads own incidents" on incidents for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));

-- homework
create policy "walker manages homework" on homework for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
create policy "client reads homework" on homework for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));
create policy "client updates homework status" on homework for update
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())))
  with check (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids())));

-- photos
create policy "walker manages photos" on photos for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
create policy "client reads own dogs' photos" on photos for select
  using (exists (select 1 from dogs d where d.id = dog_id and d.client_id in (select my_client_ids()))
         or (dog_id is null and walk_id is not null
             and exists (select 1 from walk_client_ids(walk_id) c where c in (select my_client_ids()))));

-- messages
create policy "walker reads/sends messages" on messages for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid() and sender_id = auth.uid());
create policy "client reads/sends messages" on messages for select
  using (client_id in (select my_client_ids()));
create policy "client sends messages" on messages for insert
  with check (client_id in (select my_client_ids()) and sender_id = auth.uid());
create policy "client marks read" on messages for update
  using (client_id in (select my_client_ids())) with check (client_id in (select my_client_ids()));
