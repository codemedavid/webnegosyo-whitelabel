# TDD Evidence — Subscriptions (₱649/month) and per-tenant allowances

**Source plan**: inline plan approved in-session (no `.plan.md` artifact was written).
**Branch**: `feat/platform-supabase-order-parity`
**Date**: 2026-07-31

Three product decisions were confirmed with the user before any code:

1. **Pause scope** — admin + merchant app only. The customer storefront stays live.
2. **Pricing unit** — flat ₱649 per store; allowances are independent per-tenant caps.
3. **Payment flow** — superadmin marks paid manually; 3-day grace before pausing.

## User journeys

| # | Journey |
|---|---|
| J1 | As a merchant who paid on time, I want the admin to stay open through my paid period, so my staff aren't interrupted. |
| J2 | As a merchant whose transfer hasn't been marked yet, I want 3 days of grace, so a weekend doesn't lock me out. |
| J3 | As the platform owner, I want a client past due + grace to be blocked from admin and app, so unpaid accounts stop consuming service. |
| J4 | As a merchant who is paused, I want to keep taking customer orders, so an unpaid ₱649 doesn't cost me a day's trade. |
| J5 | As the platform owner, I want to mark a client paid and have their access restored immediately, with a record of what paid for it. |
| J6 | As the platform owner, I want to set how many branches and staff each client may create, without a deploy. |
| J7 | As the platform owner, I want to see who owes money first when I open the subscriptions screen. |

## Task report

| Task | Summary | RED evidence | GREEN evidence |
|---|---|---|---|
| Status resolver | Pure `resolveSubscriptionAccess` over paid-through + grace, in Manila days | `Cannot find module '@/lib/billing/subscription-status'` (`a277d5a`) | 20/20 pass (`c0aaf15`) |
| Payment service | `markPaid` over an injected store; ledger written before access extends | `Cannot find module '@/lib/billing/subscription-service'` (`188e2eb`) | 18/20 → **real bug found** → 20/20 (`5e0979a`) |
| Allowances | Per-tenant staff seats + branch cap replace the hard-coded `MAX_STAFF_PER_TENANT = 3` | 8 failed / 10 passed (`e4b78f6`) | 18/18 (`5f99ef2`) |
| Migration | 2 columns + 2 tables + RLS, applied and probed against the live DB | n/a (schema) | probe results below (`4c3e882`) |
| App pause | `resolveSession` gains a `paused` mode; both entry points read the subscription | `TS2554: Expected 3-4 arguments, but got 5` (`0e117e7`) | 17/17 (`3cc7170`) |
| Web pause | Layout redirect (UX) + `assertSubscriptionActive` in actions (boundary) | `Cannot find module '@/lib/billing/subscription-gate'` (`a66df23`) | 11/11 (`b411410`) |
| Superadmin UI | Collections roster ordered by urgency, Mark Paid dialog, allowance fields | ⚠️ see deviation below | 12/12 (`0b0fbce`) |
| Seat wiring | The staff action and its labels read the tenant's allowance, not the constant | n/a (wiring; covered by existing tests) | 4176/4176 (`405f12a`) |

### The bug the tests caught

`markPaid` originally computed the period end as `addMonths(start, n) - 1 day`. For a
period starting 31 January that yields **27 February**, because the month-clamp to
28 February had already consumed the boundary — the merchant silently loses a day
every time a long month meets a short one. Two tests failed; the fix skips the
day-subtraction whenever the month arithmetic clamped.

This is the case for writing the test first: the formula looks obviously correct.

### Migration probe (live database)

```
tenants=172  subscriptions=172  with_runway=172  earliest_due=2026-08-30
tenants_over_branch_cap=0  non_default_seat_caps=0  policies=4
```

Every existing tenant was backfilled with 30 days of runway and its **actual**
branch count, so nobody is over their cap on day one and nobody is locked out on
deploy.

### RLS boundary (live database, simulated merchant JWT)

The security-critical assertion of the whole feature — a merchant must not be able
to mark themselves paid:

```sql
SET request.jwt.claims → a real role='admin' app_users row
SELECT own subscription   → readable = 1   (paused screen can explain itself)
UPDATE own subscription   → rows written = 0   (write refused)
```

Both assertions passed; the `DO` block raises `SECURITY FAILURE` on any other outcome.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A merchant is active through their paid-through date, inclusive | `subscription-status.test.ts` | unit | PASS |
| 2 | The cut is Manila midnight, not UTC — 23:59 Manila is still open | `subscription-status.test.ts` | unit | PASS |
| 3 | 3 days of grace, then blocked on day 4 | `subscription-status.test.ts` | unit | PASS |
| 4 | `cancelled`/`paused` block regardless of a future paid-through date | `subscription-status.test.ts` | unit | PASS |
| 5 | No row, no due date, corrupt date, or unreadable clock all resolve to OPEN | `subscription-status.test.ts` | unit | PASS |
| 6 | Paying early stacks onto the existing period; no paid days are burned | `subscription-service.test.ts` | unit | PASS |
| 7 | A lapsed merchant's new period starts today, not from a date that has passed | `subscription-service.test.ts` | unit | PASS |
| 8 | Month arithmetic clamps (31 Jan → 28/29 Feb) and crosses years | `subscription-service.test.ts` | unit | PASS |
| 9 | Paying reopens a `paused` or `past_due` subscription | `subscription-service.test.ts` | unit | PASS |
| 10 | A failed ledger write does not extend access | `subscription-service.test.ts` | unit | PASS |
| 11 | A raised seat allowance actually grants seats; a used-up one refuses | `tenant-limits.test.ts` | unit | PASS |
| 12 | Seats count per branch; the owner never consumes one | `tenant-limits.test.ts` | unit | PASS |
| 13 | An unset or negative allowance falls back to the platform default, never unlimited | `tenant-limits.test.ts` | unit | PASS |
| 14 | A tenant over a lowered branch cap keeps its branches but cannot add more | `tenant-limits.test.ts` | unit | PASS |
| 15 | A superadmin is never blocked, in either the gate or the redirect | `subscription-gate.test.ts`, `session-paused.test.ts` | unit | PASS |
| 16 | The storefront tenant read is not subscription-gated | `subscription-gate.test.ts` | guardrail | PASS |
| 17 | The paused screen lives outside the admin tree it redirects out of | `subscription-gate.test.ts` | guardrail | PASS |
| 18 | Both app entry points SELECT the subscription columns the gate reads | `session-paused.test.ts` | guardrail | PASS |
| 19 | A paused app session stays authenticated so the screen can explain itself | `session-paused.test.ts` | unit | PASS |
| 20 | Debtors sort to the top; MRR excludes tenants who aren't paying | `subscription-roster.test.ts` | unit | PASS |

Full suites: **web 338 suites / 4176 tests pass**; **app 95 of 96 suites pass**
(the one failure is pre-existing — see below).

## Coverage

```
 lib/billing                 |    86.3 |       97 |   95.65 |    86.3
  plan.ts                    |     100 |     100  |     100 |     100
  subscription-gate.ts       |     100 |     100  |     100 |     100
  subscription-roster.ts     |     100 |     100  |     100 |     100
  subscription-service.ts    |     100 |     100  |     100 |     100
  subscription-status.ts     |     100 |   95.34  |     100 |     100
  subscription-repository.ts |       0 |       0  |       0 |       0
```

Every pure decision module is at 100%. `subscription-repository.ts` is the Supabase
I/O seam and is uncovered by design — the same arrangement as the other repository
modules in this codebase, and the reason the logic was pushed out of it.

## Deviations and known gaps

- **`subscription-roster.ts` was written test-after, not test-first.** The 12 tests
  pass and cover ordering, MRR exclusion, and immutability, but there was no RED
  gate for that module. Recorded here rather than presented as clean TDD.
- **UI components have no rendering tests.** `subscription-manager.tsx`,
  `mark-paid-dialog.tsx`, and both paused screens are covered only by the
  source-reading guardrails. Their logic lives in the tested pure modules.
- **The RLS boundary is proven against the live database, not in CI.** The probe
  above is reproducible SQL but is not wired into the test suite.
- **No end-to-end run of the pause.** No tenant has actually been allowed to lapse
  and confirmed blocked in a browser or on a device; the gate is proven by unit
  tests and source guardrails only.

## Pre-existing issues found, not fixed (outside this task's scope)

1. **`webnegosyo-app` `lib/daily-report/parity.test.ts` fails on this branch.** A
   concurrent session committed inventory branch-stock work between my commits; the
   app's `MOVEMENT_REASONS` was not updated for the web ledger's new reasons
   (`sale`, `stocktake`, `void`, `waste`). Unrelated to subscriptions.
2. **Regenerated Supabase types expose 6 real drift bugs.** The live DB has
   `tenants.convex_schema_version` and `tenants.hero_design` as `text` while the code
   writes a number and a JSON object, and `checkout_lead_status_history` does not
   exist at all despite the old types file declaring it. Rather than break three
   unrelated features, `src/types/supabase.ts` was left as-is and only the two new
   tables plus two new columns were hand-added. **The drift is still there.**
3. **Migration timestamp collision.** `20260808120000_subscriptions_and_limits.sql`
   shares its timestamp with `20260808120000_inventory_branch_stock.sql` from the
   concurrent session. Both applied cleanly; worth renaming one before it confuses
   an ordering assumption later.
