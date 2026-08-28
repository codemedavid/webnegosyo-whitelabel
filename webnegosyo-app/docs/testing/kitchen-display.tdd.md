# TDD Evidence — Kitchen Display System

**Source plan**: inline `/ecc:plan` output in-session (2026-08-29); no `*.plan.md` artifact.
**Cycle**: RED `1727c9f` → GREEN `71d04edd` → refactor (this commit).

## User journeys

1. As a cook, I want a live board of confirmed orders with everything on each ticket, so I can cook without asking the counter.
2. As a cook, I want to bump a finished ticket (and recall a mistaken bump), so the counter knows the plate is ready.
3. As a cook on a rush, I want an all-day roll-up of item quantities across tickets, so I can batch the grill.
4. As a cook, I want a printed kitchen chit with no prices, so the ticket can ride the rail.
5. As an owner, I want kitchen-display access to be its own staff grant, so a kitchen tablet cannot reach the order queue, payments, or cancellations.
6. As a merchant, I want the board to work on a phone (single rail) and a tablet (grid), and never dim mid-service.

## Task report

| Task | Validation | RED evidence | GREEN evidence |
|---|---|---|---|
| Ticket logic (`lib/kitchen-tickets.ts`) | `npx jest kitchen` | `TS2307: Cannot find module './kitchen-tickets'` | suite passes |
| Chit layout (`lib/kitchen-chit.ts`) | `npx jest kitchen` | `TS2307: Cannot find module './kitchen-chit'` | suite passes |
| `kitchen` permission + tab + screen wiring | `npx jest kitchen` | 14 failed (key absent, tab unmapped→ALLOWED, no route file) | 34 passed |
| Registry parity (web/app/desktop) | web `npm test -- --testPathPatterns="staff-permissions"` | web pinned-list test failed after app key added | 33 passed |

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | Only confirmed + preparing orders become tickets, oldest first, items joined by orderId | `lib/kitchen-tickets.test.ts` | PASS |
| 2 | Bump always lands on `ready`; recall lands on `preparing` | `lib/kitchen-tickets.test.ts` | PASS |
| 3 | Timer formats `4m` / `1h 12m`, clamps clock skew to `0m` | `lib/kitchen-tickets.test.ts` | PASS |
| 4 | All-day roll-up keys on name + variation (legacy and grouped), busiest first | `lib/kitchen-tickets.test.ts` | PASS |
| 5 | Chit carries KITCHEN header, order ref, type, customer, qty×item, addons, notes — and **no prices** | `lib/kitchen-chit.test.ts` | PASS |
| 6 | Chit ships as printer segments compatible with `printReceiptSegments` | `lib/kitchen-chit.test.ts` | PASS |
| 7 | Tab is in the Operations view, has a route file, and is layout-registered with the `show()` gate | `lib/kitchen-screen-mount.test.ts` | PASS |
| 8 | Staff without the `kitchen` grant are denied; grantees, owners, legacy full-access allowed | `lib/kitchen-screen-mount.test.ts` | PASS |
| 9 | Screen uses shared ticket logic, backend-routed reads, shared status mutation, branch scope, responsive columns, keep-awake, chit printing, demo gate | `lib/kitchen-screen-mount.test.ts` | PASS |
| 10 | Web and app permission registries stay identical | `tests/unit/staff-permissions-parity.test.ts` (web) | PASS |

## Suite results

- App: `npx jest` → **214 suites / 3045 tests passed** (clean re-run; an earlier run's 5 failures were a race with in-flight edits and did not reproduce).
- Web: `staff-permissions` pattern → 2 suites / 33 tests passed. Web lint has 88 pre-existing errors; the changed files lint clean.
- App: `npx tsc --noEmit` clean; changed files ESLint clean.

## Round 2 — iOS simulator run (2026-08-29)

Cycle: RED `d6a41b9b` → GREEN `8c0f20d9`.

Run on a Debug build (ExpoKeepAwake 15.0.8 was already linked, so no native
rebuild) against Metro, driven with `idb ui tap`. Two devices:

| Device | Session | What it showed |
|---|---|---|
| iPad Pro 11" (M4) | Demo store | Kitchen tab present with its icon; board mounts; `0 open`; "All caught up" empty state — which matched the data exactly (the public demo store has 2 pending + 1 cancelled and **no** confirmed/preparing orders) |
| iPhone 17 | A real merchant session persisted on that simulator | 4 live tickets: oldest-first order, all-day roll-up, variations (`Mixed Seafoods (Java rice)`), add-ons (`+ Java rice`), `DELIVERY` chips, `PREPARING` marker, urgency bands |

No order was bumped or confirmed on either device: the iPhone was pointed at a
real store, and manufacturing a ticket would have mutated live data and rung
push notifications on real handsets.

### Defects the run found (neither was caught by the unit suite)

| # | Defect | Evidence | Fix |
|---|---|---|---|
| 1 | **Every ticket flashed as new on open** — all four cards drew the green "new" outline. `selectNewOrders` was seeded from the empty array the screen holds *while orders are still loading*, so the first real batch all read as new. | screenshot `iphone-02` (all borders green) vs `iphone-04` (neutral) | `scanNewTickets` distinguishes `undefined` (in flight) from `[]` (answered, nothing active) and adopts the first answered snapshot without flashing; moved out of the render phase into an effect |
| 2 | **Timer had no day rollover** — a months-old ticket rendered `2189h 26m` | screenshot `iphone-02` | `formatTicketTimer` rolls over to `77d 2h` (verified on device in `iphone-04`) |

### Test-teeth check

`components/kitchen/TicketCard.test.tsx` was written against already-shipped
code, so passing proved nothing on its own. Three deliberate mutations were
injected (drop the special-instructions line, bump the wrong order id, remove
`textDecorationLine`); **exactly the 3 corresponding tests failed** and the
other 10 stayed green. The component was then restored from git and re-verified
clean (`git diff` empty, 13/13 passing).

### Round 2 suite results

- App: `npx jest` → **219 suites / 3108 tests passed**
- Web: `npx jest` → **536 suites / 6337 tests passed**
- Blast radius (`kitchen|staff-permissions|workspaces|tab-navigation|owner-surface|order-alerts`) → 9 suites / 140 passed
- `npx tsc --noEmit` and ESLint clean on changed files

## Known gaps

- No station routing (grill/fry per-item stations) — deferred, needs per-item config that doesn't exist.
- Item strike-through is per-display local state, deliberately unsynced.
- The *screen* is asserted by source-guardrail tests plus the live simulator run; only the `TicketCard` is render-tested. No automated E2E.
- Multi-column tablet grid was never seen populated: the only device with active tickets was a phone, and the iPad session (demo store) had an empty board. Column counts remain covered by code inspection only.
- Bump and recall were not exercised end to end against a backend, for the data-safety reason above.
- Both refs the board reads are platform-adapter supported (`orders:getOrders`, `orders:getAllOrderItems`, `orders:updateOrderStatus`), so platform-backend tenants work; per-tenant `supabase` track remains "unsupported" as designed.
- Desktop POS registry got the key for parity only; no desktop kitchen UI.
