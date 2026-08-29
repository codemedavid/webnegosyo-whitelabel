# TDD Evidence — Chef-set prep time → customer ETA

**Source plan**: inline `/ecc:plan` output in-session (2026-08-29), approved with
"proceed". No `*.plan.md` artifact was written.

**Cycle**: RED `c93added` → GREEN (see *Commit provenance* below).

## User journeys

1. As a cook, I want to tap how long a ticket will take, so the customer stops
   wondering and stops calling the store.
2. As a cook running behind, I want to push the promise back, so the customer
   sees the truth rather than a time that already passed.
3. As a customer, I want to know when my food will be ready, so I can time my
   walk to the counter.
4. As a customer whose order is late, I want honest words rather than a
   countdown running into the negative.
5. As a merchant on a delivery order, I do not want the kitchen implicitly
   promising a doorstep time it does not control.
6. As an owner on a store whose backend cannot store a prep time yet, I want the
   control hidden rather than shown and failing on tap.

## The decision the feature rests on

A prep time is stored as an **absolute instant** (`promised_ready_at`), stamped
at the moment the chef taps, with `prep_minutes` kept beside it as the
merchant's record of the choice. A stored duration carries no information about
when its clock started — the order was placed at 7:00, confirmed at 7:04, tapped
at 7:06 — so "15 minutes" would mean three different things and would still read
"15 minutes" an hour later.

## Task report

| Task | Validation | RED evidence | GREEN evidence |
|---|---|---|---|
| Merchant prep-time logic (`webnegosyo-app/lib/prep-time.ts`) | `npx jest prep-time` | `TS2307: Cannot find module './prep-time'` | suite passes |
| DTO projection (`supabase-orders.ts`) | `npx jest supabase-orders` | `TS2339: Property 'promisedReadyAt' does not exist on type 'OrderDto'` | suite passes |
| Adapter ref + switch (`supabase-adapter.ts`) | `npx jest supabase-adapter` | `isPlatformRefSupported("orders:setPrepTime")` returned `false` | suite passes |
| Ticket chips (`TicketCard.tsx`) | `npx jest TicketCard` | 5 failed (no chips, no promise pill, no `+5`) | 18 passed |
| Customer promise (`src/lib/prep-time.ts`) | `npx jest prep-time` (web) | `Cannot find module '@/lib/prep-time'` | suite passes |
| Tracking wiring (service + page) | `npx jest prep-time-wiring` | no `promisedReadyAt` / `serverNowMs` in either file | suite passes |

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | The promise is stamped from the tap, not the order's creation | `lib/prep-time.test.ts` | PASS |
| 2 | Minutes are validated at the boundary; junk, fractions, 0, negatives and >240 never reach a backend | `lib/prep-time.test.ts` | PASS |
| 3 | Remaining time rounds UP, so a promise 30s out reads `1 min`, never `0` | `lib/prep-time.test.ts` | PASS |
| 4 | Lateness is reported as a positive number, so no caller can render a negative countdown | `lib/prep-time.test.ts` | PASS |
| 5 | Committing to a time moves a confirmed ticket to `preparing` | `lib/prep-time.test.ts` | PASS |
| 6 | The control is hidden on a Convex deployment below v24, on the per-tenant `supabase` track, and when the version is unknown | `lib/prep-time.test.ts` | PASS |
| 7 | Both fields survive the platform DTO projection; absent stays undefined | `lib/backends/supabase-orders.test.ts` | PASS |
| 8 | `orders:setPrepTime` is in the allowlist **and** served by the switch, writing both columns plus status in one patch | `lib/backends/supabase-adapter.test.ts` | PASS |
| 9 | A branch-scoped account cannot re-time another branch's ticket | `lib/backends/supabase-adapter.test.ts` | PASS |
| 10 | Chips send the tapped minutes for the right order; `+5` extends an existing promise | `components/kitchen/TicketCard.test.tsx` | PASS |
| 11 | A set promise shows as a clock time, not raw minutes | `components/kitchen/TicketCard.test.tsx` | PASS |
| 12 | Customer sees target time + rounded wait; delivery promises the kitchen, not the doorstep | `tests/unit/prep-time.test.ts` (web) | PASS |
| 13 | Past the promise the words change (`Almost there` / `Running a little behind`), never the number | `tests/unit/prep-time.test.ts` | PASS |
| 14 | No estimate is shown on `pending`, `ready`, or `cancelled` | `tests/unit/prep-time.test.ts` | PASS |
| 15 | The Supabase read is isolated from the order's own select, so an unmigrated column cannot take the order page down | `tests/unit/prep-time-wiring.test.ts` | PASS |
| 16 | The countdown is derived from a server clock, not the device clock | `tests/unit/prep-time-wiring.test.ts` | PASS |

## Suite results

- App: `npx jest` → **227 suites / 3231 tests passed**
- Web: `npx jest` → **546 suites / 6427 passed**, 1 suite / 8 tests skipped (pre-existing)
- `npx tsc --noEmit` clean on changed files; ESLint clean on changed files.

## Commit provenance — read this before looking for the feature commit

The RED checkpoint is `c93added`. The GREEN commit **does not exist as a separate
commit**: a second Claude session working in this same tree ran `git commit`
against the shared index in the window between this session's `git add` and its
`git commit`, sweeping every prep-time file into that session's commits.

The feature code landed in `6e55fdb9` ("docs: TDD evidence for the platform-DB
audit fixes") and `b6f6fe72`. Content was verified intact at HEAD after the fact
(schema version, adapter ref, both pure modules, migration, screens). No history
was rewritten: the other session may already be building on those commits, and
rewriting shared history mid-flight is worse than a misleading commit message.

The suite numbers above were produced against exactly the tree that those
commits contain.

## Deployment — the feature is inert until these run

| Backend | Requirement | Status |
|---|---|---|
| Platform Supabase | `20260829130000_order_prep_time.sql` | **NOT applied** |
| Convex tenants | Deploy Schema to v24 per tenant | **NOT deployed** |
| Merchant app | JS-only change, OTA-able; no native build needed | not shipped |

`CURRENT_SCHEMA_VERSION` went 23 → 24. **v23 was claimed by the concurrent
session's service-charge work**, and per project memory v21 and v22 were already
pending deployment before either of these. Any tenant deploy now carries four
versions' worth of change at once.

## Known gaps

- **Nothing was run against a live backend.** No migration applied, no Convex
  deploy, no simulator run. Every guarantee above is a unit-level one.
- The merchant **order-detail screen did not get the control**, though the
  approved plan listed it. `app/(main)/order/[orderId].tsx` was being edited by
  the concurrent session and did not typecheck at the time (`TS2339:
  'serviceCharge' does not exist on type 'OrderDetail'`). Editing it would have
  risked corrupting their in-flight work. Kitchen board only, for now.
- "Custom" minutes took the concrete form of a **second preset row** (5/45/60/90
  behind "More") plus **`+5`** on an existing promise, rather than a numeric
  input. A kitchen tablet is used with wet or gloved hands and a keyboard there
  is a poor control. This is a deviation from the word "custom" in the approved
  plan and is called out here rather than left to be discovered.
- No auto-ETA from a store default, no per-item prep times, no "you're running
  late" push, no estimate-accuracy analytics. All deliberately out of scope.
- The white-labeled customer app (`mobile/`) renders its own order-status screen
  from local state and does **not** read the tracking service, so it shows no
  ETA. Untouched by design.
