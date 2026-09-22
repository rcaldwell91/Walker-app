-- 0003 Client relationship: check-ins, suggestion box, ratings, tips.

create type rating_target as enum ('walker', 'client');
create type tip_status as enum ('pending', 'paid', 'cancelled');

-- ---------------------------------------------------------------------------
-- Check-ins: sent on the walker's cadence. Answers stored as JSON so the
-- question set can evolve without migrations.
-- ---------------------------------------------------------------------------
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  due_at date not null,
  sent_at timestamptz,
  responded_at timestamptz,
  -- { walker_satisfaction: 1-5, app_satisfaction: 1-5, dog_progress: text,
  --   at_home_training: text, requests: text }
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index check_ins_client_idx on check_ins (client_id, due_at desc);
create index check_ins_walker_idx on check_ins (walker_id, due_at desc);

-- ---------------------------------------------------------------------------
-- Suggestion box. Anonymous by default: we verify the sender is a paying
-- client of this walker at insert time, then store no client id.
-- ---------------------------------------------------------------------------
create table suggestions (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  is_anonymous boolean not null default true,
  client_id uuid references clients (id) on delete set null,   -- only when not anonymous
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (is_anonymous = (client_id is null))
);
create index suggestions_walker_idx on suggestions (walker_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Ratings, both directions. Clients never see ratings ABOUT them (RLS below).
-- ---------------------------------------------------------------------------
create table ratings (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  target rating_target not null,        -- who is being rated
  rater_profile_id uuid not null references profiles (id),
  walk_id uuid references walks (id) on delete set null,
  score smallint not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index ratings_walker_idx on ratings (walker_id, target);
create index ratings_client_idx on ratings (client_id, target);

-- Public aggregate for a walker's profile page.
create or replace view walker_rating_summary as
  select walker_id, count(*)::int as rating_count, round(avg(score), 2) as avg_score
  from ratings where target = 'walker' group by walker_id;

-- ---------------------------------------------------------------------------
-- Tips. Payment processing lands with Stripe; the intent is recorded now.
-- ---------------------------------------------------------------------------
create table tips (
  id uuid primary key default gen_random_uuid(),
  walker_id uuid not null references walkers (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  walk_id uuid references walks (id) on delete set null,
  amount_cents int not null check (amount_cents > 0),
  status tip_status not null default 'pending',
  note text,
  created_at timestamptz not null default now()
);
create index tips_walker_idx on tips (walker_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table check_ins enable row level security;
alter table suggestions enable row level security;
alter table ratings enable row level security;
alter table tips enable row level security;

create policy "walker manages check-ins" on check_ins for all
  using (walker_id = auth.uid() or is_operator()) with check (walker_id = auth.uid());
create policy "client reads own check-ins" on check_ins for select
  using (client_id in (select my_client_ids()));
create policy "client answers own check-ins" on check_ins for update
  using (client_id in (select my_client_ids())) with check (client_id in (select my_client_ids()));

-- suggestions: walker reads; an active client of that walker can insert
create policy "walker reads suggestions" on suggestions for select
  using (walker_id = auth.uid() or is_operator());
create policy "walker marks suggestions read" on suggestions for update
  using (walker_id = auth.uid()) with check (walker_id = auth.uid());
create policy "paying client submits suggestion" on suggestions for insert
  with check (
    exists (select 1 from clients c join walkers w on w.id = c.walker_id
            where c.walker_id = suggestions.walker_id and c.profile_id = auth.uid()
              and c.status = 'active' and w.suggestion_box_enabled)
    and (is_anonymous or client_id in (select my_client_ids()))
  );

-- ratings
-- Walker sees ratings of themselves and ratings they gave clients.
create policy "walker reads own ratings" on ratings for select
  using (walker_id = auth.uid() or is_operator());
create policy "walker rates clients" on ratings for insert
  with check (walker_id = auth.uid() and target = 'client' and rater_profile_id = auth.uid());
-- Client sees only ratings they gave (target = walker). Never ratings about them.
create policy "client reads ratings they gave" on ratings for select
  using (target = 'walker' and client_id in (select my_client_ids()));
create policy "client rates walker" on ratings for insert
  with check (target = 'walker' and client_id in (select my_client_ids()) and rater_profile_id = auth.uid());
-- Public aggregate only
grant select on walker_rating_summary to anon, authenticated;

-- tips
create policy "walker reads tips" on tips for select using (walker_id = auth.uid() or is_operator());
create policy "client manages own tips" on tips for all
  using (client_id in (select my_client_ids())) with check (client_id in (select my_client_ids()));
