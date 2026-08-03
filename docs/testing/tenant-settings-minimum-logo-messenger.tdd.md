# TDD Evidence — Tenant-managed minimum order, logo, and Messenger username

**Source plan**: inline plan agreed in-session (no `*.plan.md` artifact was written).
**Branch**: `feat/android-sms-followups`
**Date**: 2026-08-03

> Note: this working tree is shared with a concurrent session doing subscription/billing
> work. Only the commits listed below belong to this task.

## User journeys

1. As a merchant, I want to require a minimum order for delivery, so that I don't
   lose money driving out a ₱150 order.
2. As a merchant, I want pickup and dine-in to stay open to any amount, so that the
   delivery minimum doesn't cost me walk-up sales.
3. As a customer, I want to be told the minimum and how much more to add, so that I
   don't stare at a dead button.
4. As a merchant, I want to change my own logo, so that I don't have to file a request
   with the platform admin for a rebrand.
5. As a merchant, I want to set my own Messenger username, so that I can fix my
   checkout handoff after switching Facebook pages.

## Task report

### Task 1 — Minimum-order rule module

Pure `resolveOrderMinimum` / `checkOrderMinimum` / `formatOrderMinimumMessage`.

- **RED**: `npx jest tests/unit/order-minimum.test.ts` →
  `Cannot find module '../../src/lib/order-minimum'` (compile-time RED; the module
  under test did not exist). Commit `d071a7d`.
- **GREEN**: same command → `Tests: 17 passed, 17 total`. Commit `5e90fbd`.
- **Guarantees**: `0`/missing/`null`/negative/`NaN`/non-numeric all mean "no minimum";
  numeric strings from PostgREST coerce; the boundary is inclusive (subtotal == minimum
  passes); shortfall is rounded to 2 decimals; an unusable subtotal fails the gate
  rather than passing it.

### Task 2 — Migration + merchant-facing field

- **Migration**: `supabase/migrations/20260818120000_order_type_minimum_order.sql`,
  `minimum_order_amount numeric(10,2) not null default 0 check (>= 0)`.
- **Applied and probed** against the live database:
  `information_schema.columns` → `{"data_type":"numeric","column_default":"0","is_nullable":"NO"}`.
- **RED**: `npx jest tests/unit/order-type-minimum-admin.test.tsx` →
  `Tests: 6 failed, 1 passed`. The zod write schema stripped the key and the form had no
  input. Commit `22ac975`.
  (An earlier run failed on a bad test fixture — missing `customer_form_fields` — which
  was a harness error, corrected before the RED was accepted.)
- **GREEN**: same command → `Tests: 7 passed, 7 total`. Commit `4b259b3`.
- **Guarantees**: the schema carries the field through to the update payload, accepts `0`,
  stays optional for pre-migration rows, and rejects a negative value matching the DB
  check constraint; the form shows the saved value, sends what was typed, and states that
  `0` means no minimum.

### Task 3 — Checkout gate (client)

- **RED**: `npx jest tests/unit/checkout-minimum-order.test.tsx` →
  `Tests: 4 failed, 6 passed`. `MinimumOrderNotice` did not exist and `CheckoutCTA` did
  not disable. Commit `71cf1da`.
- **GREEN**: same command → `Tests: 10 passed, 10 total`. Commit `d1dcbdb`.
- **Guarantees**: the gate measures the ITEM subtotal, so a delivery fee cannot carry a
  small cart over a delivery minimum; switching order type re-evaluates; the notice names
  both the minimum and the shortfall; submit is disabled below the minimum and enabled at
  or above it, and for order types with no minimum.
- Applied to all five checkout designs (classic, modern, minimal, express, wizard).

### Task 4 — Checkout gate (server, authoritative)

- **RED**: `npx jest tests/unit/actions/create-order-minimum.test.ts` →
  `Tests: 2 failed, 4 passed`. Commit `4b09e4d`.
  (First run failed on swapped `createOrderAction(tenantId, items, …)` arguments — a
  harness error, corrected before the RED was accepted. The 4 passing tests are
  negative-case regression guards that would pass either way.)
- **GREEN**: same command → `Tests: 6 passed, 6 total`. Commit `be8f6f8`.
- **Guarantees**: a below-minimum order is rejected before ANY order-backend dispatch, so
  the gate holds for Convex, tenant-owned Supabase, and the platform Supabase alike, and
  for the mobile apps which never see the web checkout button.

### Task 5 — Tenant-managed logo

- **RED**: `npx jest tests/unit/branding-logo.test.ts` → `Tests: 3 failed, 3 passed`.
  Commit `8bef5a5`.
- **GREEN**: same command, plus the existing branding suites →
  `Test Suites: 3 passed, Tests: 53 passed`. Commit `20a70a5`.
- **Guarantees**: `logo_url` survives the branding write schema into the update payload;
  a cleared logo persists as `''`, never `null` (the column is NOT NULL); the field stays
  optional so saving another section leaves the logo untouched; it is registered as an
  `image` field on the Global Brand surface.

### Task 6 — Tenant-managed Messenger username

- **RED**: `npx jest tests/unit/messenger-username.test.tsx` →
  `Cannot find module '../../src/lib/messenger-username'`. Commit `631b416`.
  (The card mock initially used wrong action names; corrected, after which the two card
  tests failed for the intended reason: no username field existed.)
- **GREEN**: same command → `Tests: 10 passed, 10 total`. Commit `398823f`.
- **Guarantees**: bare handles, `@handle`, `m.me/…`, `facebook.com/…`, trailing slashes
  and query strings all normalize to the bare handle — a stored URL would otherwise
  produce `m.me/https://m.me/shop` at checkout; a blank clears the field; a URL with no
  handle is rejected rather than silently becoming empty. The action verifies tenant admin
  before writing.

### Task 7 — Robustness fix found by the full suite

Running the whole suite surfaced a real defect: `CheckoutCTA` read `orderMinimum.meets`
unconditionally and threw when the field was absent, which would break the checkout button
for any caller without it.

- **Evidence**: `npx jest tests/unit` → `Tests: 2 failed` in
  `messenger-order-type-toggle.test.tsx` (`at meets (checkout-primitives.tsx:691)`).
- **Fix**: `orderMinimum?.meets === false` — absent status means "not blocked".
  Commit `bcc0871`.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Absent/zero/invalid minimums never gate an order | `tests/unit/order-minimum.test.ts` | unit | PASS |
| 2 | A subtotal exactly equal to the minimum is accepted | `tests/unit/order-minimum.test.ts` | unit | PASS |
| 3 | Shortfall is exact to 2 decimals, no float drift | `tests/unit/order-minimum.test.ts` | unit | PASS |
| 4 | The write schema carries `minimum_order_amount`, rejects negatives | `tests/unit/order-type-minimum-admin.test.tsx` | unit | PASS |
| 5 | The admin form shows and saves the merchant's minimum | `tests/unit/order-type-minimum-admin.test.tsx` | component | PASS |
| 6 | The gate uses the item subtotal, not the grand total | `tests/unit/checkout-minimum-order.test.tsx` | unit | PASS |
| 7 | Submit is disabled below the minimum, enabled at/above it | `tests/unit/checkout-minimum-order.test.tsx` | component | PASS |
| 8 | The customer is told the minimum and the shortfall | `tests/unit/checkout-minimum-order.test.tsx` | component | PASS |
| 9 | The server rejects below-minimum orders before backend dispatch | `tests/unit/actions/create-order-minimum.test.ts` | integration | PASS |
| 10 | Pre-migration order types are never gated | `tests/unit/actions/create-order-minimum.test.ts` | integration | PASS |
| 11 | `logo_url` reaches the DB payload and never as `null` | `tests/unit/branding-logo.test.ts` | unit | PASS |
| 12 | The logo is an editable image field on the Global surface | `tests/unit/branding-logo.test.ts` | unit | PASS |
| 13 | Any Messenger page reference normalizes to a bare handle | `tests/unit/messenger-username.test.tsx` | unit | PASS |
| 14 | The card shows and saves the merchant's username | `tests/unit/messenger-username.test.tsx` | component | PASS |

## Coverage

```
npx jest tests/unit/order-minimum.test.ts tests/unit/messenger-username.test.tsx \
  tests/unit/checkout-minimum-order.test.tsx --coverage \
  --collectCoverageFrom='src/lib/{order-minimum,messenger-username}.ts'

File                   | % Stmts | % Branch | % Funcs | % Lines
All files              |     100 |    93.93 |     100 |     100
 messenger-username.ts |     100 |    83.33 |     100 |     100
 order-minimum.ts      |     100 |      100 |     100 |     100
```

Full suite: `npx jest tests/unit` → `Tests: 4863 passed, 1 failed` (391 suites).

## Known gaps

- **The one failing suite is not from this task.** `tests/unit/subscription-screen-legibility.test.tsx`
  fails in isolation and belongs to a concurrent session's billing work (commit `b480c49`).
  Verified by running it alone: `Tests: 1 failed, 8 passed`.
- **Mobile customer app checkout is not updated.** It has its own checkout screen and will
  not show the minimum before submit; the server-side gate in Task 4 still rejects the
  order, so the customer sees a server error rather than an inline notice. Deliberately
  out of scope — say the word and it's a follow-up phase.
- **The cart page shows no minimum hint.** The order type isn't chosen until checkout, so
  the cart cannot know which minimum applies. Deliberate.
- **Pre-existing `tsc` and lint errors** exist in `sms/`, `tests/integration/`,
  `src/app/api/mcp/oauth/token/route.ts`, `src/hooks/useCart.tsx`, and the concurrent
  session's `subscription-manager.tsx`. None are in files changed by this task; lint over
  the changed files reports warnings only.
