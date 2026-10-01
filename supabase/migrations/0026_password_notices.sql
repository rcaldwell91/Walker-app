-- 0026 "Your password has shown up in a known data breach" — shown once after sign-in.
--
-- Its own table, not a column on profiles: walkers can read their clients'
-- profile rows, and nobody else should learn this about a person.
--   state 'show'      → the sign-in check found it; show the notice.
--   state 'dismissed' → they've seen it (dismissed, or chose "Use it anyway"
--                       when setting it). Don't show it again for this password.
-- No row → nothing to say. Changing the password deletes the row.
-- Written only by the server with the service role; a person reads their own.

create table password_notices (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null check (state in ('show', 'dismissed')),
  updated_at timestamptz not null default now()
);

alter table password_notices enable row level security;
create policy "own password notice" on password_notices for select using (user_id = auth.uid());

revoke all on password_notices from anon;
revoke insert, update, delete, truncate, references, trigger on password_notices from authenticated;
