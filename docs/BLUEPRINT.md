# Walker App — Blueprint

*"Walker App" is a placeholder, not the name. Name still to be decided.*

Software that helps independent dog walkers run the business they already have. Not a marketplace (yet). Walkers sign up on their own, send a link to each client, and the client fills in their own info. The walker's day-to-day — pickups, routes, notes, photos, messages — happens in one place instead of across texts, photo rolls, and memory.

Same shape and stack as LaborMoves: one master operator (Robert), many walkers as tenants, each with their own clients. Next.js on Vercel, Supabase for database, auth, storage, and realtime. Row-level security keeps every walker's data separate.

---

## Who uses it

| Role | What they do |
|---|---|
| **Operator** (Robert) | Sees every walker, handles support, reviews misconduct reports, sets platform pricing, publishes the resource library and community content. |
| **Walker** | Signs up self-serve. Manages clients, dogs, schedule, walks, notes, photos, homework, check-ins. Links up with other walkers for coverage. |
| **Client** (dog owner) | Joins via the walker's link. Fills in intake, sees walk reports, GPS trail, photos, homework, and check-ins. Rates the walker, answers check-ins, can use the anonymous suggestion box. Never sees their own rating. |
| **Coverage walker** | A walker in someone's squad who's been pre-approved by a client to take a walk when the regular walker is out. |

Services aren't only walks: sitting, cat visits, small-animal visits, and so on each have their own tap-button set.

---

## Features

Everything below is in scope. It's grouped by build stage so we always have something working to look at, and because later stages depend on earlier ones.

### Stage 1 — Foundation
- Database schema, row-level security, storage buckets
- Operator, walker, client, dog, service-type, and pricing tables
- Both pricing models modeled from day one (see Pricing)

### Stage 2 — Getting people in
- Walker self-serve signup, login, profile page (bio, photo, services, rates, background-check proof upload)
- Client invite link → client signs up → **intake form** (standard onboarding questions; voice-to-text friendly)
- Dog profiles: basics, vet, meds, quirks, what they're working on

### Stage 3 — The walk itself
- **Pickup summary**: when you select a dog you see what they're working on and where they're at
- **Tap buttons** per service type: pooped, peed, water, fed, meds, plants, trash, etc.
- **Voice-to-text notes**: talk like you normally would; it becomes notes on each dog
- **End-of-walk update** to the dog's progress notes
- **Quick incident reports**
- **Homework** for clients ("work on wait and stay at home")
- **Photo album** in the app, with upload-and-delete-from-phone as a later option. Uploads queue when there's no signal on the trail and send when there is.

### Stage 4 — Schedule, routes, GPS
- **Scheduler**: recurring and one-off walks and visits
- **One-tap walk setup**: pick the dogs, pick the trail, best pickup route is calculated. Suggests trails near your end point.
- **Client and trail map**: color-coded, grouped
- **GPS + timer**: starts at pickup, stops at drop-off. Clients see the trail, distance, and the full paid time. Walkers get drive-time and hours records.
- **One-tap client messages**: "On my way" with live ETA, "I'm here", "Dropped off"

### Stage 5 — Client relationship
- **Check-ins** on the walker's chosen cadence: satisfaction with walker and app, dog progress, what they're doing at home, requests
- **Anonymous suggestion box** on the walker's profile (paying clients only)
- **Ratings** both ways. Clients don't see their own.
- **Tips** for walkers

### Stage 6 — Coverage squad
- Walkers link with walkers they trust
- A client pre-approves specific coverage walkers (keys, home access)
- When a walker is sick or away, an approved squad member takes the walk and the client is told

### Stage 7 — Community and safety
- **Live alerts**: one tap to report fires, coyotes, rattlesnakes, accidents; nearby walkers see them
- **Misconduct reports** about other walkers in the network, reviewed by the operator
- **Forums**: trail recommendations, training help, peer support
- **Meetups**: plan routes together, walk with a friend
- **Resource library**: researched tips and videos for being a better walker (Vera to review)

### Stage 8 — Money
- Walkers set their rates per service
- Platform pricing (see below) — modeled now, billing wired up when Stripe is set up
- Paid "ask an expert" — later

### Later phases (not now)
- Marketplace where clients browse and hire walkers, with walker performance data as the selling point
- Background checks run by the platform (v1 only lets walkers upload proof)

---

## Pricing

Every walker gets every feature. Price scales with usage, not features.

Two models, both built into the data model so either can be switched on:

1. **Fee on top.** Walker sets their rate; the platform adds its percentage on top, so the client pays it. Walker keeps their full rate.
2. **Percentage of earnings.** Platform takes a percentage of what the walker earns.

Either way, the percentage is **capped at a flat monthly amount**. Once a walker hits the cap, that's all they pay that month. Low-volume walkers pay a little; busy walkers pay a predictable flat fee.

Numbers still to decide. $20–50/month floated as a gut check.

---

## Rules carried over from LaborMoves
- Finish everything buildable before signing up for or paying for external services (Stripe, Twilio, maps API keys, DNS)
- Walker-facing copy treats walkers with trust, not suspicion. Every button routes somewhere.
- Keep it simple on the trail: one tap wherever possible, works with spotty service

## Open questions
- App name
- Pricing numbers and cap
- Whether photos should delete from the phone after upload (needs a native app or a manual step; a web app can't delete from the camera roll)
- Maps provider (Mapbox vs Google) — pick when we wire up Stage 4
