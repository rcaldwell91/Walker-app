# Walker App (working title)

Software that helps independent dog walkers run the business they already have. See `docs/BLUEPRINT.md` for the full picture.

## Stack

- Next.js 15 (App Router, server actions) on Vercel
- Supabase: Postgres + row-level security, Auth, Storage
- Tailwind v4

## First-time setup

1. `npm install`
2. Create a Supabase project. In the SQL editor, run each file in `supabase/migrations/` in order (or `supabase db push` with the CLI).
3. Copy `.env.example` to `.env.local` and fill in the URL, anon key, and service role key from Project Settings → API.
4. In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` to redirect URLs.
5. `npm run dev` and open http://localhost:3000

To make yourself the operator: after signing up as a walker, run in the SQL editor
`update profiles set role = 'operator' where id = '<your user id>';`

## Testing the database locally

Migrations and the RLS isolation test run on plain Postgres with a small Supabase stand-in:

```
createdb dl_test
psql -d dl_test -f supabase/tests/00_supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -v ON_ERROR_STOP=1 -d dl_test -f "$f"; done
psql -d dl_test -c "grant usage on schema public, auth to authenticated, anon; grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated, anon;"
psql -d dl_test -f supabase/tests/01_rls_smoke.sql
```

## Where things are

| Path | What |
|---|---|
| `supabase/migrations/` | Schema, in build-stage order (0001 foundation … 0006 storage) |
| `src/app/(auth)/` | Walker login and signup |
| `src/app/join/[token]/` | Client invite link → account → intake |
| `src/app/(walker)/` | Everything the walker sees (Today, Clients, Walk, Map, More) |
| `src/app/my/` | Everything the client sees |
| `src/app/admin/` | Operator view |
| `src/components/voice-input.tsx` | The mic button. Browser speech-to-text, no API key. |
