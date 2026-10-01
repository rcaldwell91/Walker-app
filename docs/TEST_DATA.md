# Test data in the live Supabase project

Taken 2026-09-30 from project `dztkbrepjfhhauuufpyk` (read-only queries). **Nothing has been deleted.** Times are UTC.

## The catch: Robert's real data lives inside the "Test Walker" login

There are only four logins:

| Login | Email | Made | What it is |
|---|---|---|---|
| Robert Caldwell (operator) | robertcaldwell91@gmail.com | Sep 23 02:04 | **Real.** Robert's operator account. |
| Test Walker ("Test Walks SF", handle `test-walker`) | robertcaldwell91+walkertest@gmail.com | Sep 22 22:27 | Test login, **but John and Spot are in it** (see below). Keep. |
| Test Client | robertcaldwell91+testclient@gmail.com | Sep 22 23:21 | Test. |
| Second Walker (handle `test-walker-2`) | robertcaldwell91+walker2@gmail.com | Sep 23 01:22 | Test (coverage squad tests). |

Because John and Spot were entered under Test Walker, the Test Walker login, its profile, its settings and its rates can't be treated as disposable.

## Robert's real data: never in scope

| Table | Record | Made |
|---|---|---|
| clients | **John** (`7c6c60e3…`), status invited | Sep 24 04:14 |
| dogs | **Spot** (`9188034f…`), John's pet | Sep 24 04:14 |
| client_invites | John's invite link (`rcy9xyqh…`), not yet used | Sep 24 04:14 |
| messages | "Hey" from Test Walker to John (`1f333d0f…`) | Sep 24 04:17 |
| profiles / walkers | Robert Caldwell (operator) | Sep 23 |

## Not sure: probably Robert trying the app on Sep 24, same few minutes as John

| Table | Record | Made | Why unsure |
|---|---|---|---|
| bookings | Booking `5029227a…` for Rex (Test Client) | Sep 24 04:12 | Made 2 minutes before John, not by a test script. |
| walks | Walk `bead5612…` with Rex | Sep 24 04:14 | Robert started it and left it at pickup. **A Part One test then used it and finished it on Sep 30** (added 2 photos, taps, ratings, $25 line). |
| walker_services | Test Walker's 2 rates (Group walk $25 etc.) | Sep 22–30 | Tests set them; Robert may rely on them now. |
| walkers | Test Walker's settings: boarding capacity 1, $45/night, $30 extra pet, bio, handle | Sep 30 | Set by the boarding test; they now show on the public page `/w/test-walker`. |
| storage `documents` | 5 files in Test Walker's background-check folder | Sep 22–23 | Test uploads, but it's the same login Robert uses. |
| storage `avatars` | 5 files (profile photos) | Sep 22–30 | Mix of test avatars; one may be the current profile photo. |

## Certain it's test data

Everything below was made by test scripts, against Test Walker, Test Client (Rex) or Second Walker.

| Table | Records | Made |
|---|---|---|
| clients | Test Client (`59470707…`) | Sep 15 (seed) |
| dogs | Rex (`6866fb81…`), incl. its boarding answers and "working on" | Sep 22 |
| client_invites | Test Client's invite (`94EmZo7W…`, used) | Sep 22 |
| bookings | `c87f80db…` (Rex, repeating) + its dog row + 3 booking exceptions | Sep 22–23 |
| trails | **Test Ridge Trail** (`150a838d…`) | Sep 22 23:18 |
| trails | **Test Park** (`1c6e8db2…`) | Sep 30 17:49 |
| walks | 7 walks, Sep 22–23: `685999a5`, `90c97455`, `7b1abc8e`, `c7bafc68`, `b0c367b4`, `48fad99b`, `21240644` | Sep 22–23 |
| walks | 1 covered walk by Second Walker: `061a3948` | Sep 23 |
| walks | 5 voice-test walks, Sep 30: `e5ccb66f`, `e1f8f53e`, `bdfdb609`, `924cb120`, `7ed5d990` | Sep 30 17:51–18:36 |
| walk_dogs / walk_events / gps_points / pet_scores / photo_pets | Rows belonging to the walks above (14 / 44 / 38 / 16 / 3) | Sep 22–30 |
| photos | 3 walk photos (`6254d2e4`, `1863e797`, plus the 2 on `bead5612` listed above as unsure) and 1 stay photo (`381c2acd`) | Sep 23–30 |
| storage `photos` | 6 image files for those photos | Sep 23–30 |
| invoices | #1 $100 sent (`26cc7aa9`), #2 $30 sent (`8caeacbb`), #3 voided (`df35859b`) | Sep 23 |
| invoices | #4 $75 draft (`4d55feec`), #5 $25 draft (`e6cb222b`), #6 $115 sent (`4944034e`, walk + boarding) | Sep 30 |
| invoice_lines | 16 lines, including **4 unbilled $25 "Group walk · Rex"** lines from the Sep 30 voice tests | Sep 22–30 |
| payments | Venmo $20, cash $10, Zelle $100 | Sep 23 |
| boarding_stays | 1 finished stay Sep 28→30 (`20d4735e`) + **3 cancelled stays** (`e4549f03`, `f157ae61`, `a72d52cb`) | Sep 30 |
| stay_pets / stay_updates / stay_update_logs | Rows for those stays (4 / 3 / 8), including one unposted update for Sep 30 | Sep 30 |
| coverage_requests | 3 (2 accepted, 1 cancelled) between Test Walker and Second Walker | Sep 23 |
| coverage_approvals / coverage_approval_asks / squad_links | 1 / 1 / 1 (Test Walker ↔ Second Walker, Test Client's approval) | Sep 23 |
| check_ins | 1 answered (Sep 23), 1 open (opened automatically on a page load Sep 30) | Sep 23, Sep 30 |
| ratings | 2 (walker 5★, client 3★) | Sep 23 |
| tips | $5 pending | Sep 23 |
| suggestions | 1 ("Would love a photo of the group…") | Sep 23 |
| dog_notes | "Rex was great with the new route." | Sep 23 |
| messages | 12 messages on Test Client's walks ("On my way", "Here", "Dropped off", replies) | Sep 22–30 |
| notifications | 39 in-app notifications to the test logins | Sep 22–30 |

## How testing works from now on

- **Database tests** run on a local Postgres (`supabase/tests/01_rls_smoke.sql`). They never touched the live project.
- **Browser tests** now run against a local Supabase started in Docker (`supabase start`), not the live project. If a live run is ever unavoidable, it uses separate logins with `+e2e` in the email and puts `[test]` in names, so every row is identifiable.

## Deletion, Oct 1 2026 — done

Robert confirmed John, Spot, the "Hey" message and the invite link are on his new walker account
(Lyon Caldwell, robertcaldwell91+walker@gmail.com) and asked for the test data to go.

**Delete:** the logins Test Walker (`859fc87a…`), Second Walker (`3cfbde0b…`), Test Client (`959f259f…`) and
everything they own. No throwaway `@e2e.test` accounts ever reached the live project (5 logins in total).
**Keep:** Lyon Caldwell (`48548bd6…`), the operator (`6201acb5…`), John, Spot, the message and the invite link.

Method: messages and ratings inside the two test walkers' accounts first (they point at people with
"no action", which blocks deleting the person), then the three logins; everything else follows by cascade.

Predicted rows (from who owns each row) vs the dry run (Oct 1, rolled back):

| Table | Predicted | Dry run |
|---|---|---|
| auth.users | 3 | 3 |
| profiles | 3 | 3 |
| walkers | 2 | 2 |
| clients (Test Client) | 1 | 1 |
| dogs (Rex) | 1 | 1 |
| walks | 14 | 14 |
| walk_dogs | 14 | 14 |
| walk_events | 44 | 44 |
| gps_points | 38 | 38 |
| bookings | 2 | 2 |
| booking_dogs | 2 | 2 |
| booking_exceptions | 3 | 3 |
| coverage_requests | 3 | 3 |
| coverage_approvals | 1 | 1 |
| coverage_approval_asks | 1 | 1 |
| squad_links | 1 | 1 |
| boarding_stays | 4 | 4 |
| stay_pets | 4 | 4 |
| stay_updates | 3 | 3 |
| stay_update_logs | 8 | 8 |
| photos | 5 | 5 |
| photo_pets | 3 | 3 |
| pet_scores | 16 | 16 |
| dog_notes | 1 | 1 |
| invoices | 6 | 6 |
| invoice_lines | 16 | 16 |
| payments | 3 | 3 |
| ratings | 2 | 2 |
| tips | 1 | 1 |
| messages | 12 | 12 |
| check_ins | 2 | 2 |
| client_invites (Test Client's) | 1 | 1 |
| suggestions | 1 | 1 |
| trails (Test Ridge Trail, Test Park) | 2 | 2 |
| walker_services | 2 | 2 |
| notifications | 39 | 39 |
| **not predicted:** auth.identities | — | 3 |
| **not predicted:** auth.sessions | — | 112 |
| **not predicted:** auth.refresh_tokens | — | 114 |

The three unpredicted rows are the three test logins' own sign-in records (3 of 5 identities, 112 of 115
sessions, 114 of 117 refresh tokens; the rest belong to the kept accounts and were untouched). Under the
"any difference: stop" rule the delete was not run. Every kept item was still there in the dry run.

Not touched by the delete: the 6 shared default service types (no owner), Lyon's push subscription.
**Stored files** (16: avatars, background-check PDFs, walk and stay photos, all under the test walkers'
folders) can't be removed by database command (Supabase blocks it); they go through the storage API with
the service key after the rows are gone.

### Result (run Oct 1 2026, after Robert's written go-ahead)

Robert approved the delete including the 229 sign-in records. It ran as one transaction that compared every
table's removed-row count with the dry run above and would have rolled back on any difference. It matched
on every table and committed. Removed: 3 logins, 3 identities, 112 sessions, 114 refresh tokens, and all the
app rows in the table above (14 walks, 6 invoices, 16 invoice lines, 3 payments, 4 stays, 3 coverage requests,
2 ratings, 1 tip, 12 messages, Test Client, Rex, 2 trails, 39 notifications, …).

Stored files: 16 removed through the storage API (5 avatars, 5 background-check PDFs, 6 walk/stay photos).
0 files left in storage.

Checks afterwards:
- The operator (robertcaldwell91@gmail.com), Lyon Caldwell (robertcaldwell91+walker@gmail.com, handle
  lyon-caldwell), John, Spot, John's invite link (expires Oct 8) and the "Hey" message are byte-for-byte the
  same as before the delete (row fingerprints compared before and after).
- No column anywhere in the public, auth or storage schemas (454 checked) still holds any of the three deleted
  account IDs, and none holds their emails, their names, or "[test]".

What's left in the live project: 2 logins (operator, Lyon Caldwell), 1 client (John), 1 pet (Spot), 1 message,
1 invite link, the 6 shared default service types, and Lyon's push subscription.
