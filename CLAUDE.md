# Working on the walker app

Read `docs/BLUEPRINT.md` first. It has the feature list grouped by build stage and the decisions already made.

## Rules

- **Multi-tenant.** Every walker is a tenant. Every table with walker data has `walker_id` and an RLS policy. Never add a table without policies. Run `supabase/tests/01_rls_smoke.sql` after schema changes.
- **Clients never see ratings about themselves.** That's enforced in RLS on `ratings`; keep it that way in the UI too.
- **Suggestion box is anonymous by default.** Don't add a client id to an anonymous suggestion, even in logs.
- **One tap wherever possible.** Walkers use this one-handed on a trail with spotty signal. Big buttons, no confirm dialogs for logging, queue writes when offline.
- **Voice first.** Anywhere a walker types more than a few words, use `VoiceInput`.
- **Walker-facing copy treats walkers with trust.** Every button routes somewhere.
- **Finish everything buildable before configuring external services** (Stripe, maps API keys, DNS). Model the data now, wire the service later.
- **No SMS.** All messaging is in-app, with Web Push notifications. Don't add Twilio or any SMS provider.
- **No platform fee.** What we charge walkers is undecided; don't build it (see blueprint, Pricing).
- **All features for every walker.** Pricing scales with usage, not features. Never gate a feature by plan.
- **Migrations are append-only** once applied to a real project. New file, higher number.
- **Notify through `notify()`** (`src/lib/notify.ts`, server only): it writes the in-app notification and sends Web Push, respecting each person's per-kind settings. New kinds go in `src/lib/push-kinds.ts`. A failed push never fails the action.
- **Billing is walker → client.** Finished walks become invoice lines by trigger, billed through the client's own walker (never the covering walker). Drafts are made on page load (`draftDueInvoices`), no cron. Sent invoices are locked; add card payments and a platform-fee line by extending the enums (see 0013), not new tables.
- **Suspended walkers are locked out by RLS** (0016): a restrictive policy on every client-data table, plus checks in the security-definer functions that return client data. A new client-data table needs the same restrictive policy; a new security-definer function that returns client data needs `i_am_suspended()`. Paused walkers keep working.
- **Operator is never self-assigned.** The operator role comes only from `app_metadata` set with the service role. Signup metadata can pick walker or client only.
- **Before launch: turn "Confirm email" back on** in Supabase (Authentication → Sign In / Providers → Email). It's off for local testing only.

## Build stages (see blueprint)

1 Foundation · 2 Getting people in · 3 The walk · 4 Schedule, routes, GPS · 5 Client relationship · 6 Coverage squad · 7 Home screen and push · 8 Money (walkers billing clients) · Phase two: community and safety, marketplace

Placeholder pages for later stages use `<ComingSoon stage={n}>`. Replace them as you build.

## Maps, geocoding, routing (Stage 4)

Free and keyless for now. Each piece sits behind one file so Mapbox or Google can replace it without touching pages:

- **Map display:** `src/components/map-view.tsx` (Leaflet + OpenStreetMap tiles). Pages pass plain pins and lines. `NEXT_PUBLIC_MAP_TILE_URL` overrides the tile server.
- **Address → coordinates:** `src/lib/geo/geocode.ts` (Nominatim). Max 1 request/second, queued in-process; runs when a client's address is saved (walker or client intake) and stores `clients.lat/lng`. `GEOCODER_URL` overrides the base URL.
- **Routing:** `src/lib/geo/distance.ts`. Pickups are ordered nearest-neighbor from the walker's current location using **straight-line distance**, and ETA = distance ÷ 25 mph, rounded up. **Real road routing (drive times, actual roads) comes later** with the maps provider.
- **Time zones:** the server runs in UTC. The browser's zone is stored in the `tz` cookie (`TimeZoneSync`); use `getTimeZone()` and pass `tz` to `fmtTime`/`fmtDate` in server components. Repeating bookings are expanded in `src/lib/schedule.ts`.
- **Realtime:** `gps_points` and `walk_events` are in the `supabase_realtime` publication (migration 0007). RLS decides who receives each row.

## Data rules learned the hard way

- **RLS limits rows; triggers limit columns.** An update policy lets someone change *every* column of a row they can update. Column guards live in migration 0009 (no self-promotion to operator, walkers can't verify their own background check, clients may only change their contact details / mark messages read / answer check-ins, tips stay pending). Add a guard whenever you add an update policy for a role that should only touch some columns.
- **Walkers aren't world-readable.** The public page `/w/[handle]` reads `public_walker_profile(handle)` only, which returns a fixed set of public fields and no client data.
- **Check-ins are opened on page load** by `open_due_check_ins(tz)` (walker's cadence; first one is due a cadence after the client was added). No cron.
- **Repeating bookings:** skip or move a single occurrence with `booking_exceptions` (0008); `src/lib/schedule.ts` applies them.
- **Embedding walkers from clients** must name the relationship: `walker:walkers!clients_walker_id_fkey(...)`. `coverage_approvals` makes a second path, and the unqualified embed errors out.
- **In storage policies, qualify `storage.objects.name`** inside subqueries; other tables (e.g. `dogs`) have a `name` column too (see 0011).

## Coverage squad (Stage 6)

- **Coverage is per occurrence**, never per series: a `coverage_requests` row has the occurrence's `occurs_on` (its series day) and actual `starts_at`. The database computes the access window (midnight the day before → midnight after, in the requester's zone).
- **The covering walker's access** to the client row and the booking's dogs comes only from `covering_client_ids()` / `covering_dog_ids()`: accepted request + client approval not revoked + now inside the window. Revoking an approval or leaving the squad cancels upcoming covers.
- **RLS now returns some rows that aren't "yours"**: covered clients/dogs (covering walker, in the window) and other walkers' walks that had your dogs (regular walker, for reports). Any query meaning "my clients / my dogs / my walks" must add `.eq("walker_id", user.id)`.
- **Squad members see each other only through `squad_overview()`** (name, handle, photo, business name, service area, phone). Walker lookup is exact-handle only (`find_walker_by_handle`). Clients see their walker's squad through `client_squad_choices()`.
- Covered walk reports: `/report/[id]` (regular walker) and `/my/walks/[id]` (client) both render `WalkReportView`.

## RLS smoke test

On a scratch Postgres (not the real project):
`createdb walker_test`, then `psql -d walker_test -f` each of `supabase/tests/00_supabase_stub.sql`, every file in `supabase/migrations/` in order, and `supabase/tests/01_rls_smoke.sql`. It rolls back and ends with "RLS smoke test passed".

## Deployment

- **Live:** https://walker-app-gamma.vercel.app (Vercel project `walker-app`, linked to this GitHub repo). Supabase project `dztkbrepjfhhauuufpyk`.
- Env vars live in Vercel (Project → Settings → Environment Variables); the service role key and VAPID private key are "sensitive". `NEXT_PUBLIC_*` values are baked in at build time, so redeploy after changing them.
- `NEXT_PUBLIC_APP_URL` builds invite links; `VAPID_SUBJECT` is the app URL (push services want a real contact URL).
- Migrations are applied to Supabase by hand (in order), not by the deploy.

## Commands

- `npm run dev` — local server
- `npm run typecheck` — TS only
- `npm run lint`

## Types

`noImplicitAny` is off until Supabase types are generated. Once the project exists, run
`npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts`,
pass `Database` to the clients in `src/lib/supabase/*.ts`, and turn `noImplicitAny` back on.
