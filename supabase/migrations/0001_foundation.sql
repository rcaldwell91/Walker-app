-- 0001 Foundation: roles, walkers (tenants), clients, dogs, services, trails, pricing.
-- Every walker is a tenant. Row-level security keeps each walker's world separate.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('operator', 'walker', 'client');
create type walker_status as enum ('active', 'paused', 'suspended');
create type client_status as enum ('invited', 'active', 'paused', 'archived');
create type service_category as enum ('walk', 'sitting', 'visit', 'other');
create type pricing_model as enum ('fee_on_top', 'percent_of_earnings');

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user, any role
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role user_role not null default 'walker',
  full_name text not null default '',
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile when a user signs up. Role comes from signup metadata.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'walker'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- updated_at helper
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth helpers used by every policy
-- ---------------------------------------------------------------------------
create or replace function is_operator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'operator');
$$;

create or replace function current_role_is(r user_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = r);
$$;

-- ---------------------------------------------------------------------------
-- Walkers (tenants)
-- ---------------------------------------------------------------------------
create table walkers (
  id uuid primary key references profiles (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9-]{3,30}$'),
  business_name text not null default '',
  bio text not null default '',
  service_area text not null default '',
  status walker_status not null default 'active',
  -- Walker uploads proof; operator marks it verified. Platform-run checks are a later phase.
  background_check_path text,
  background_check_verified_at timestamptz,
  check_in_cadence_days int not null default 30 check (check_in_cadence_days between 7 and 365),
  suggestion_box_enabled boolean not null default true,
  tips_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger walkers_updated_at before update on walkers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Clients (dog owners), owned by exactly one walker
-- ---------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  -- Null until the client redeems their invite and creates a login.
  profile_id uuid references profiles (id) on delete set null,
  name text not null,
  email text,
  phone text,
  address_line text,
  city text,
  lat double precision,
  lng double precision,
  -- Keys, gate codes, alarm notes. Walker-only; never shown to other clients.
  home_access_notes text,
  emergency_contact text,
  status client_status not null default 'invited',
  color text,                  -- map color, e.g. '#2f7d5b'
  group_label text,            -- "Tuesday group", "Northside", etc.
  intake_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (walker_id, profile_id)
);
create index clients_walker_idx on clients (walker_id);
create index clients_profile_idx on clients (profile_id);
create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

-- Client IDs that the current user (as a dog owner) is attached to.
create or replace function my_client_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from clients where profile_id = auth.uid();
$$;

-- Invite links: walker → client. One token per client; can be regenerated.
create table client_invites (
  token text primary key default encode(gen_random_bytes(18), 'base64url'),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index client_invites_client_idx on client_invites (client_id);

-- ---------------------------------------------------------------------------
-- Dogs
-- ---------------------------------------------------------------------------
create table dogs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  walker_id uuid not null references walkers (id) on delete cascade,
  name text not null,
  breed text,
  sex text,
  birthdate date,
  weight_lbs numeric(5,1),
  photo_path text,
  vet_name text,
  vet_phone text,
  medications text,
  allergies text,
  quirks text,                 -- reactive to bikes, pulls on leash, etc.
  -- What this dog is working on right now. Shown at pickup, updated after the walk.
  working_on text not null default '',
  progress_summary text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dogs_client_idx on dogs (client_id);
create index dogs_walker_idx on dogs (walker_id);
create trigger dogs_updated_at before update on dogs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Service types and per-walker rates
-- Platform defaults have walker_id = null. Walkers can add their own.
-- log_buttons: the one-tap buttons shown during this service.
-- ---------------------------------------------------------------------------
create table service_types (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid references walkers (id) on delete cascade,
  key text not null,
  name text not null,
  category service_category not null,
  default_duration_min int not null default 60,
  log_buttons jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  unique (walker_id, key)
);

insert into service_types (key, name, category, default_duration_min, log_buttons, sort_order) values
  ('group_walk',  'Group walk',     'walk',    60, '["poop","pee","water","treat","note"]', 1),
  ('private_walk','Private walk',   'walk',    60, '["poop","pee","water","treat","note"]', 2),
  ('drop_in',     'Drop-in visit',  'visit',   30, '["poop","pee","water","fed","meds","plants","trash","mail","note"]', 3),
  ('cat_visit',   'Cat visit',      'visit',   30, '["litter","water","fed","meds","plants","trash","mail","play","note"]', 4),
  ('small_pet',   'Small pet visit','visit',   20, '["water","fed","cage","note"]', 5),
  ('sitting',     'Overnight sitting','sitting', 720, '["poop","pee","water","fed","meds","plants","trash","mail","note"]', 6);

create table walker_services (
  walker_id uuid not null references walkers (id) on delete cascade,
  service_type_id uuid not null references service_types (id) on delete cascade,
  rate_cents int not null check (rate_cents >= 0),
  duration_min int,
  enabled boolean not null default true,
  primary key (walker_id, service_type_id)
);

-- ---------------------------------------------------------------------------
-- Trails / walk locations. Platform ones have walker_id = null.
-- ---------------------------------------------------------------------------
create table trails (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid references walkers (id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  notes text,
  color text,
  good_for_rain boolean not null default false,
  created_at timestamptz not null default now()
);
create index trails_walker_idx on trails (walker_id);

-- ---------------------------------------------------------------------------
-- Platform pricing. Both models modeled; operator flips which is live.
-- ---------------------------------------------------------------------------
create table platform_pricing (
  id int primary key default 1 check (id = 1),
  model pricing_model not null default 'fee_on_top',
  percent numeric(5,2) not null default 10.00 check (percent between 0 and 100),
  monthly_cap_cents int not null default 30000 check (monthly_cap_cents >= 0),
  updated_at timestamptz not null default now()
);
insert into platform_pricing default values;

-- Per-walker override (e.g. an early beta walker on a deal). Null = platform default.
create table walker_pricing (
  walker_id uuid primary key references walkers (id) on delete cascade,
  model pricing_model,
  percent numeric(5,2) check (percent between 0 and 100),
  monthly_cap_cents int check (monthly_cap_cents >= 0),
  note text
);

-- Monthly fee ledger, filled in as walks complete. Billing itself comes with Stripe later.
create table walker_fee_ledger (
  walker_id uuid not null references walkers (id) on delete cascade,
  month date not null,                 -- first day of month
  gross_cents int not null default 0,  -- what the walker billed
  fee_cents int not null default 0,    -- platform fee accrued (capped)
  capped boolean not null default false,
  primary key (walker_id, month)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table walkers enable row level security;
alter table clients enable row level security;
alter table client_invites enable row level security;
alter table dogs enable row level security;
alter table service_types enable row level security;
alter table walker_services enable row level security;
alter table trails enable row level security;
alter table platform_pricing enable row level security;
alter table walker_pricing enable row level security;
alter table walker_fee_ledger enable row level security;

-- profiles
create policy "own profile" on profiles for select using (id = auth.uid() or is_operator());
create policy "update own profile" on profiles for update using (id = auth.uid());
-- A walker can see the profiles of their clients; a client can see their walker's.
create policy "walker sees client profiles" on profiles for select using (
  exists (select 1 from clients c where c.profile_id = profiles.id and c.walker_id = auth.uid())
);
create policy "client sees walker profile" on profiles for select using (
  exists (select 1 from clients c where c.walker_id = profiles.id and c.profile_id = auth.uid())
);

-- walkers: public read of the profile page (handle, bio); full row for self and operator
create policy "walker public read" on walkers for select using (true);
create policy "walker insert self" on walkers for insert with check (id = auth.uid());
create policy "walker update self" on walkers for update using (id = auth.uid() or is_operator());

-- clients
create policy "walker manages own clients" on clients for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() or is_operator());
create policy "client reads own row" on clients for select using (profile_id = auth.uid());
create policy "client updates own contact info" on clients for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- invites: walker manages; redemption happens server-side with the service role
create policy "walker manages invites" on client_invites for all
  using (walker_id = auth.uid()) with check (walker_id = auth.uid());

-- dogs
create policy "walker manages dogs" on dogs for all
  using (walker_id = auth.uid() or is_operator())
  with check (walker_id = auth.uid() or is_operator());
create policy "client reads own dogs" on dogs for select using (client_id in (select my_client_ids()));
create policy "client updates own dogs" on dogs for update
  using (client_id in (select my_client_ids())) with check (client_id in (select my_client_ids()));
create policy "client adds own dogs" on dogs for insert
  with check (client_id in (select my_client_ids()));

-- service types: defaults readable by all; walkers manage their own
create policy "read service types" on service_types for select
  using (walker_id is null or walker_id = auth.uid()
         or walker_id in (select walker_id from clients where profile_id = auth.uid()));
create policy "walker manages own service types" on service_types for all
  using (walker_id = auth.uid()) with check (walker_id = auth.uid());
create policy "operator manages default service types" on service_types for all
  using (is_operator()) with check (is_operator());

-- walker_services: walker manages; their clients can read rates
create policy "walker manages rates" on walker_services for all
  using (walker_id = auth.uid()) with check (walker_id = auth.uid());
create policy "clients read walker rates" on walker_services for select
  using (walker_id in (select walker_id from clients where profile_id = auth.uid()));

-- trails
create policy "read trails" on trails for select using (walker_id is null or walker_id = auth.uid());
create policy "walker manages own trails" on trails for all
  using (walker_id = auth.uid()) with check (walker_id = auth.uid());
create policy "operator manages default trails" on trails for all
  using (is_operator()) with check (is_operator());

-- pricing
create policy "anyone reads platform pricing" on platform_pricing for select using (true);
create policy "operator sets platform pricing" on platform_pricing for update using (is_operator());
create policy "walker reads own pricing" on walker_pricing for select using (walker_id = auth.uid() or is_operator());
create policy "operator manages walker pricing" on walker_pricing for all using (is_operator()) with check (is_operator());
create policy "walker reads own ledger" on walker_fee_ledger for select using (walker_id = auth.uid() or is_operator());
