# Speed: what was measured and what changed (Oct 1, 2026)

## How it was measured

The live site can't be reached from the build machine, and Vercel's own per-request timings need the paid
"Observability Plus" plan (the API refused with "available on Pro and Enterprise plans"). So production was
rebuilt locally as faithfully as possible:

- A real production build (`next build` + `next start`), not the dev server.
- Chrome set to a phone: "Slow 4G" (150 ms latency, 1.6 Mb/s down, 750 kb/s up), 4x slower CPU, 390×844 screen.
- Every call from the app to the database went through a relay that adds a fixed round trip:
  - **65 ms** for "before": the app's server code ran in Vercel's Washington DC region (iad1) and the database
    is in Northern California (Supabase us-west-1). 65 ms is a typical coast-to-coast round trip; real
    calls also pay TLS and gateway time, so this understates the real cost.
  - **3 ms** for "after the region move": server code in San Francisco (sfo1), next to the database.
- Each screen loaded 3 times; the middle value is reported. Script: `lPerf.cjs` (scratchpad), relay `latency-proxy.cjs`.
- "Loaded" = the whole page has arrived and been drawn. "Rounds" = database calls that had to wait for an earlier one.

Live database check (pg_stat_statements): average query time 0.3–25 ms. **The database itself is not slow;
the time was spent going back and forth to it.** The sign-in session lookup alone had run 2,617 times.

## Results

| Screen | Before: loaded | DB calls / back-to-back rounds | After code fixes (same distance) | After code + region move | DB calls / rounds after |
|---|---|---|---|---|---|
| Today | 940 ms | 30 / 8 | 363 ms | 306 ms | 13 / 3 |
| Pets & clients | 651 ms | 16 / 6 | 277 ms | 292 ms | 6 / 2 |
| Pet page | 587 ms | 11 / 6 | 285 ms | 268 ms | 5 / 2 |
| Start walk | 696 ms | 14 / 7 | 323 ms | 339 ms | 9 / 2 |
| Schedule | 695 ms | 20 / 5 | 295 ms | 282 ms | 8 / 2 |
| Map | 627 ms | 11 / 6 | 319 ms | 344 ms | 6 / 2 |
| Money | 643 ms | 17 / 6 | 294 ms | 271 ms | 11 / 3 |
| Walk tab mid-walk | 1466 ms | 12 / 11 | 982 ms | 958 ms | 4 / 2 |
| Live walk | 706 ms | 14 / 7 | 320 ms | 289 ms | 7 / 2 |
| Wrap-up | 807 ms | 14 / 7 | 486 ms | 440 ms | 7 / 3 |

| Tab tap | Before: first sign of response | Before: page shown | After: first sign | After: page shown |
|---|---|---|---|---|
| Pets | 609 ms | 626 ms | 127 ms | 301 ms |
| Walk | 702 ms | 720 ms | 160 ms | 316 ms |
| Map | 591 ms | 633 ms | 144 ms | 362 ms |
| More | 682 ms | 700 ms | 117 ms | 330 ms |
| Today | 768 ms | 782 ms | 126 ms | 281 ms |

Differences of ±30 ms between runs are noise.

## What each fix bought

1. **One sign-in check per page, done locally** (`getClaims()` checks the token with the project's public key;
   React `cache()` shares the answer between the frame and the page). Before, every page asked the login
   service "who is this?" 7–18 times (the gatekeeper, the frame, the page, and every link the browser
   pre-loads). This was the biggest single cost: it removed 6–17 calls and 3–4 rounds per page.
2. **Asking for everything at once.** Pages that waited for one answer before asking the next now ask together:
   Start walk 7→2 rounds, live walk 7→2, wrap-up 7→3, Today 8→3 (with fix 1).
3. **Side work after the page is on screen.** Boarding reminders ("starts tomorrow") are claimed and pushed
   after the page is sent (Today, Boarding, the client's home), never before it.
4. **The Walk tab goes straight to the walk in progress.** Before, mid-walk it opened Start walk, which then
   sent the walker on to the walk: 11 rounds, 1.5 s. Now 2 rounds, about 1 s, and the outline shows at 0.15 s.
5. **An outline the instant something is tapped** (`loading.tsx` on every section, `PageSkeleton`), and the tapped
   tab lights up at once. First sign of a response to a tab tap went from 0.6–0.8 s (nothing on screen until
   the whole page arrived) to 0.12–0.16 s.
6. **Indexes and access rules** (migration 0028): an index behind each of the 39 links between tables that had
   none, and 85 access rules changed to work out "who is asking" once per query instead of once per row.
   No measurable change today (queries already take milliseconds with this little data); it keeps them fast
   as walkers add clients and walks.
7. **Server code moved next to the database** (`vercel.json`, region sfo1). In this simulation it saves only
   ~30–60 ms per page, because fix 1 and 2 already cut the round trips to 2–3. Its real value is likely
   larger than shown (real cross-country calls also pay TLS and gateway time), and it matters most for the
   first request after a quiet spell, which has to open new connections.
8. **Going back to a tab seen in the last 30 seconds** shows it without asking the server (`staleTimes`).
   Not separately measured.

## What code can't fix

- **The live walk screen takes about 1 s on a slow phone**, mostly the phone's own processor drawing the screen and
  the map (about 350 ms at 4x CPU slowdown), plus loading the map code the first time. The outline shows at 0.15 s.
  Making the map start after the rest of the screen is drawn is the next step if this is still felt.
- **Cold starts were not measured.** The live site is blocked from the build machine and Vercel's timing data needs
  the paid plan. Robert can see them in Vercel → the project → Observability on Pro.
- **Supabase free plan:** projects with little activity over 7 days are paused (Supabase docs, "Project Pausing");
  the first visit after that fails until it is resumed in the dashboard. The Pro plan never pauses. Query speed
  itself is not the limit (0.3–25 ms on live), so a bigger paid database would not make pages faster today.
- **Vercel Hobby:** functions run in one region (now sfo1). The paid plan adds the request-level timing data used to
  see real cold starts; it is not needed for the fixes above.
