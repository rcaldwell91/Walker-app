# Working on the walker app

Read `docs/BLUEPRINT.md` first. It has the feature list grouped by build stage and the decisions already made.

## Rules

- **Multi-tenant.** Every walker is a tenant. Every table with walker data has `walker_id` and an RLS policy. Never add a table without policies. Run `supabase/tests/01_rls_smoke.sql` after schema changes.
- **Clients never see ratings about themselves.** That's enforced in RLS on `ratings`; keep it that way in the UI too.
- **Suggestion box is anonymous by default.** Don't add a client id to an anonymous suggestion, even in logs.
- **One tap wherever possible.** Walkers use this one-handed on a trail with spotty signal. Big buttons, no confirm dialogs for logging, queue writes when offline.
- **Voice first.** Anywhere a walker types more than a few words, use `VoiceInput`.
- **Walker-facing copy treats walkers with trust.** Every button routes somewhere.
- **Finish everything buildable before configuring external services** (Stripe, Twilio, maps API keys, DNS). Model the data now, wire the service later.
- **All features for every walker.** Pricing scales with usage, not features. Never gate a feature by plan.
- **Migrations are append-only** once applied to a real project. New file, higher number.
- **Before launch: turn "Confirm email" back on** in Supabase (Authentication → Sign In / Providers → Email). It's off for local testing only.

## Build stages (see blueprint)

1 Foundation · 2 Getting people in · 3 The walk · 4 Schedule, routes, GPS · 5 Client relationship · 6 Coverage squad · 7 Community and safety · 8 Money

Placeholder pages for later stages use `<ComingSoon stage={n}>`. Replace them as you build.

## Commands

- `npm run dev` — local server
- `npm run typecheck` — TS only
- `npm run lint`

## Types

`noImplicitAny` is off until Supabase types are generated. Once the project exists, run
`npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts`,
pass `Database` to the clients in `src/lib/supabase/*.ts`, and turn `noImplicitAny` back on.
