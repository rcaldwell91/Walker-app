-- 0005 Community and safety: live alerts, misconduct reports, forums, meetups, resource library.

create type alert_kind as enum ('fire', 'coyote', 'rattlesnake', 'accident', 'closure', 'other');
create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type resource_kind as enum ('video', 'article', 'tip');

-- ---------------------------------------------------------------------------
-- Live alerts: one tap, expires on its own. Visible to every walker in the network.
-- ---------------------------------------------------------------------------
create table alerts (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  kind alert_kind not null,
  lat double precision not null,
  lng double precision not null,
  description text,
  trail_id uuid references trails (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  resolved_at timestamptz
);
create index alerts_active_idx on alerts (expires_at) where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Misconduct reports about another walker. Operator reviews. Reporter stays
-- hidden from the subject.
-- ---------------------------------------------------------------------------
create table misconduct_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references walkers (id) on delete cascade,
  subject_walker_id uuid not null references walkers (id) on delete cascade,
  what_happened text not null,
  where_when text,
  status report_status not null default 'open',
  operator_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporter_id <> subject_walker_id)
);
create trigger misconduct_reports_updated_at before update on misconduct_reports
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Forums
-- ---------------------------------------------------------------------------
create table forum_threads (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references walkers (id) on delete cascade,
  title text not null,
  body text not null,
  tag text,                     -- 'trails', 'training', 'gear', 'business', ...
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger forum_threads_updated_at before update on forum_threads
  for each row execute function set_updated_at();

create table forum_posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references forum_threads (id) on delete cascade,
  author_id uuid not null references walkers (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
create index forum_posts_thread_idx on forum_posts (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Meetups: walk together, plan routes together.
-- ---------------------------------------------------------------------------
create table meetups (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references walkers (id) on delete cascade,
  trail_id uuid references trails (id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  notes text,
  squad_only boolean not null default false,
  created_at timestamptz not null default now()
);
create table meetup_rsvps (
  meetup_id uuid not null references meetups (id) on delete cascade,
  walker_id uuid not null references walkers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meetup_id, walker_id)
);

-- ---------------------------------------------------------------------------
-- Resource library. Operator publishes; reviewed_by records who checked it.
-- ---------------------------------------------------------------------------
create table resources (
  id uuid primary key default gen_random_uuid(),
  kind resource_kind not null,
  title text not null,
  url text,
  body text,
  audience text not null default 'walker' check (audience in ('walker', 'client', 'both')),
  reviewed_by text,
  published boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table alerts enable row level security;
alter table misconduct_reports enable row level security;
alter table forum_threads enable row level security;
alter table forum_posts enable row level security;
alter table meetups enable row level security;
alter table meetup_rsvps enable row level security;
alter table resources enable row level security;

create policy "walkers read alerts" on alerts for select using (current_role_is('walker') or is_operator());
create policy "walker posts alert" on alerts for insert with check (walker_id = auth.uid());
create policy "walker resolves own alert" on alerts for update using (walker_id = auth.uid() or is_operator());

create policy "reporter reads own report" on misconduct_reports for select
  using (reporter_id = auth.uid() or is_operator());
create policy "walker files report" on misconduct_reports for insert with check (reporter_id = auth.uid());
create policy "operator handles reports" on misconduct_reports for update using (is_operator());

create policy "walkers read forum" on forum_threads for select using (current_role_is('walker') or is_operator());
create policy "walker posts thread" on forum_threads for insert with check (author_id = auth.uid());
create policy "author or operator edits thread" on forum_threads for update using (author_id = auth.uid() or is_operator());
create policy "walkers read posts" on forum_posts for select using (current_role_is('walker') or is_operator());
create policy "walker replies" on forum_posts for insert with check (author_id = auth.uid());
create policy "author or operator edits post" on forum_posts for update using (author_id = auth.uid() or is_operator());

create policy "walkers read meetups" on meetups for select
  using (is_operator() or (current_role_is('walker') and (not squad_only or host_id = auth.uid() or host_id in (select my_squad_ids()))));
create policy "walker hosts meetup" on meetups for insert with check (host_id = auth.uid());
create policy "host edits meetup" on meetups for update using (host_id = auth.uid() or is_operator());
create policy "walkers read rsvps" on meetup_rsvps for select using (current_role_is('walker') or is_operator());
create policy "walker rsvps" on meetup_rsvps for all using (walker_id = auth.uid()) with check (walker_id = auth.uid());

create policy "read published resources" on resources for select using (published or is_operator());
create policy "operator manages resources" on resources for all using (is_operator()) with check (is_operator());
