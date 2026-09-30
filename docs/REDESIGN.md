# Redesign and boarding

All notes below come from Robert, recorded word for word so nothing is lost. Built in two parts: Part One (redesign) is finished, checked and committed on its own before Part Two (boarding) starts.

Decisions that are deliberately **later**, not now:

- **Per-walker section choice.** Every walker sees every section for now. No presets, no on/off switches. Robert wants to see the whole app before dialling it back; letting each walker choose which sections they see comes later.
- **Squad coverage for boarding** is out of scope. Whether (and how) a squad member can cover a boarding stay is a later decision.
- **The "Talk it through" voice wrap-up needs an Anthropic API key**, which doesn't exist yet. The button shows "Needs setup" until `ANTHROPIC_API_KEY` is set on the server.

---

## PART ONE: REDESIGN

### Terminology

- "Dogs" becomes "Pets" everywhere a person can see it. Leave database table names alone; change the wording in the UI only.

### Navigation and shell

- Add a back button to every page below the top level. Nobody should need the browser's back button.
- Light and dark mode. Follow the phone's setting by default, with a manual toggle in settings. Dark is the current look — give light the same care.
- Five bottom tabs. Map keeps its own tab.
- "More" is overloaded. Break it into these groups, each its own page:
  - Pets & clients
  - Money — invoices, payments, tips, my rates
  - Schedule & hours — bookings, hours this week and month, time off
  - Check-ins & suggestions
  - Coverage squad
  - Profile & account — public profile, notifications, add to home screen, background check, log out
  - Coming soon — the phase-two list (alerts, forums, meetups, resources, marketplace), greyed out, no dead links
- Every walker sees everything for now. No presets, no on/off switches. Robert wants to see the whole app before dialling it back. (Per-walker section choice comes later.)

### The walk, in three stages

Split a walk into three stages with a visible progress indicator.

1. **Before the walk** — pick pets, pick a park, see the suggested pickup order, "On my way" with ETA, "I'm here", mark each pet picked up.
2. **During the walk** — keep this screen nearly empty. Big timer, the map with the GPS line, and two buttons: quick photo and quick note. Nothing else. The walker is holding leashes.
3. **Wrap-up, after "End walk"** — everything else lives here, one scrollable page:
   - One-tap log buttons per pet: pooped, peed, water, treat, fed, meds and so on by service type. These do NOT belong on the during-walk screen.
   - Photos: add several, tag which pets each belongs to, see them as a gallery before sending. Keep the shrinking and offline queue that already work.
   - "Working on" box per pet — keep exactly as is. Free text, optional, blank if they worked on nothing.
   - Delete the "Where they're at" box.
   - Quick ratings per pet, 1–5, all optional, one tap each: energy level, behavior on leash, mood, health/appetite. Make the set easy to add to — more are coming.
   - Walk summary for the owners — keep it, with the mic.
   - Finish walk.

### Voice wrap-up

- One big button at the top of the wrap-up: "Talk it through".
- The walker talks normally: "Rex pooped twice, peed, had water, we worked on loose leash, low energy today but happy, no limping."
- Speech to text uses the browser recognition already in VoiceInput — no extra service.
- Send that text server-side to the Anthropic API along with the pets on this walk, the available log buttons and the rating categories. Ask for structured JSON back: which buttons for which pet, each pet's "working on", the ratings, and a draft owner summary.
- Fill the wrap-up in from that, clearly marking what it filled so the walker can see what changed. Nothing saves until they tap Finish. Every field stays editable.
- If the key is missing, the network is down, or the response won't parse: say so in one plain line, leave the buttons working, and never lose what the walker already typed.
- There is NO API key yet, and that's expected. Read ANTHROPIC_API_KEY from the environment, add it to .env.example, and when it isn't set show the button as "Needs setup". Build and ship everything else. Never put the key in the browser.

### Map tab

The map is where a walker plans the day. Make it do real work:

- All clients as colour-coded pins, filter by group.
- Parks and trails as a second pin type, added by tapping the map or searching an address.
- Each park carries attributes the walker sets: shade, off-leash, paved path, water, parking, bathroom, fenced, good in rain.
- From the map: tap the pets going out, then either pick a park or tap "Suggest a park" for the closest ones to the last pickup. "Show me another" cycles through. Filter suggestions by those attributes.
- That selection carries straight into starting a walk, so the map and Start walk are one flow instead of two.

### Mobile and look

- Phone-first and one-handed throughout. Thumb-reachable buttons, nothing important in the top corners.
- Go through every screen for spacing, hierarchy and tap-target size, not only the new ones.

### Check Part One, then commit it before moving on

Typecheck, lint, build, RLS smoke test. In the headless browser as Test Walker: run a walk through all three stages, do the wrap-up with buttons, add two photos, set ratings, fill "working on", send it, and confirm Test Client sees all of it. Test light and dark. Test the back button. Confirm the voice button reads "Needs setup" and the wrap-up still works without it. Commit and push.

---

## PART TWO: BOARDING

Boarding is overnight and multi-night stays, not single visits. Build it as its own area with its own bottom-level pages, reachable from Schedule & hours and from the client and pet pages. Remove boarding from the "Coming soon" list.

- **Boarding calendar:** month view showing which nights are booked and how many spots are left. The walker sets how many pets they can take at once, and blocks out dates they're away.
- **Booking a stay:** client and pets, drop-off date and time, pick-up date and time, price. Warn when a booking would go over capacity, but let the walker book it anyway.
- **Boarding rates:** per night, per pet, plus a rate for each additional pet from the same client. Set on the same page as walk rates.
- **Boarding intake:** an extra section on top of the normal client intake — feeding schedule and amounts, medication times, where the pet sleeps, crate or not, separation anxiety, what they do when left alone, vet release permission, emergency contact, and what the client is bringing.
- **Boarding gallery:** photos of the walker's space, managed in Profile, shown on the public profile and to clients looking at a stay.
- **Daily update during a stay:** the wrap-up, cut down. Tap buttons for fed, meds, potty, walk, playtime, plus photos, a short note and the same quick ratings. One per day. The client sees them as a running diary for that stay, newest first. Same "Talk it through" voice button, same "Needs setup" behaviour.
- **Stay summary at pick-up:** every day together, total nights, all photos, ready to bill.
- **Billing:** a stay bills like a walk — nights × rate, extra pets added, straight onto the client's invoice.
- One pet, one profile, shared between walking and boarding, with the boarding answers as an extra section.
- **Push notifications:** stay starting tomorrow, daily update ready, stay ending tomorrow. Same on/off settings pattern.
- Squad coverage for boarding is out of scope — a later decision (see top).
- Add the boarding tables with RLS matching the existing rules, and extend the RLS smoke test: clients see only their own stays and daily updates, walkers only their own clients' stays.

### Check Part Two

Typecheck, lint, build, RLS smoke test. In the headless browser: Test Walker sets a capacity and a nightly rate, books Test Client's pet for a two-night stay, fills the boarding intake, posts a daily update with a photo, ends the stay, and bills it. Confirm Test Client sees the intake, both daily updates, the photos and the invoice. Confirm the capacity warning fires when over-booked. Commit and push.
