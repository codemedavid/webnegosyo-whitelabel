# TDD Evidence — Loyverse push on every app confirm surface

**Date:** 2026-08-15
**Branch:** main
**Checkpoints:** `356cb43` (RED) → `34d9bbf` (GREEN)
**Source plan:** derived in-session from the `/ecc:plan` output for "when a tenant
has Loyverse, confirming an order in webnegosyo-app should post it to Loyverse —
make that work in all logics". No `*.plan.md` artifact was written.

## The defect

Loyverse phases 1–4 shipped the whole push pipeline, but only **one** of the
app's confirm surfaces actually used it.

| Surface | Confirm path | Before | After |
|---|---|---|---|
| Order detail `app/(main)/order/[orderId].tsx` | status → confirmed | pushed (with items) | pushes (with items) |
| Orders list `app/(main)/orders.tsx` | quick-advance pending→confirmed | **silently skipped** | pushes (id only) |
| Register drawer `app/(main)/pos-sales.tsx` | incoming-order confirm | **silently skipped** | pushes (id only) |
| POS tender `pos-tender.tsx` | counter sale | pushed | unchanged |

The blocker was structural, not a missing call: a list row carries a total and
an item **count**, never the dishes. Those surfaces can only name an order, and
`POST /api/loyverse` returned **404** for an order id with no platform `orders`
row and no caller-supplied items — which is exactly every Convex-backend order.

## User journeys

1. As a merchant on a Loyverse tenant, I want an order I confirm from the orders
   list to appear as a Loyverse sales receipt, so my Back Office totals and stock
   are right no matter which screen I confirmed from.
2. As a cashier confirming an incoming order from the register drawer, I want the
   same, so a busy shift does not silently drop sales from Loyverse.
3. As a merchant, I want a sale filed under one receipt reference regardless of
   which screen confirmed it, so Back Office does not show it twice under two refs.
4. As a merchant on a tenant with no Loyverse (or an unreachable deployment), I
   want confirming an order to keep working normally.

## What changed

- **`src/lib/loyverse/convex-order-lines.ts`** (new, pure) — Convex `orderItems`
  → platform `OrderItem`. Derives unit price from the subtotal (Convex `price` is
  the base price; option surcharges live only in the subtotal), maps
  `variationSelections` → `variations`, reduces addon objects to names, and drops
  malformed rows rather than throwing. Mirrors
  `src/lib/inventory/customer-order-items.ts`.
- **`src/app/api/loyverse/route.ts`** — resolution is now platform row →
  caller-supplied items → the tenant's own Convex deployment (queried with the
  deploy key only the platform holds). Unreadable cases return a `skipped`
  response instead of 404.
- **`webnegosyo-app/lib/loyverse-confirm.ts`** (new) — one
  `pushConfirmedOrderToLoyverse(orderId, items?)` shared by all three confirm
  surfaces. Owns the tenant guard, the never-throw contract, and the derived
  receipt reference.
- The two missing surfaces now call it; the detail screen was migrated onto it.

## Task report

### 1. Convex order-line mapper

- **RED:** `Cannot find module '../../src/lib/loyverse/convex-order-lines'` —
  compile-time RED, the test newly references the missing module.
- **GREEN:** `npx jest --config jest.config.cjs tests/unit/loyverse-convex-order-lines.test.ts` → **12 passed**.
- **Guarantees:** option surcharges reach the receipt price; deleted dishes and
  non-positive quantities drop instead of dividing by zero; a malformed external
  response never throws.

### 2. `/api/loyverse` Convex fallback

- **RED:** `npx jest --config jest.config.cjs tests/unit/api/loyverse-route.test.ts`
  → **4 failed, 6 passed**. All four failures were `Expected: 200, Received: 404`
  — the route rejecting an order id it could not find in the platform table. The
  6 passing were the authorization and POS tests, asserting unchanged behavior.
- **GREEN:** same command → **10 passed**.
- **Guarantees:** an orderId-only confirm resolves lines from Convex; a platform
  order never triggers a Convex round trip; caller-supplied items are preferred;
  unconfigured/unreachable/missing-order all report `skipped`, not an error; and
  **no Convex or admin-key read happens before authorization passes**.

### 3. Shared app confirm helper

- **RED (module):** `TS2307: Cannot find module './loyverse-confirm'`.
- **RED (receipt reference):** after the helper existed, the reference test failed
  with `Received: {"orderId": "k57abcdef123456"}` — no `orderNumber`.
- **GREEN:** `npx jest lib/loyverse-confirm.test.ts` → **5 passed**.
- **Guarantees:** the order id alone is a legal push; supplied items pass through;
  no tenant means no push; the helper never throws; every surface stamps the same
  receipt reference.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Convex line maps to the platform OrderItem shape | `tests/unit/loyverse-convex-order-lines.test.ts` | unit | PASS |
| 2 | Unit price is derived from subtotal so surcharges reach the receipt | same | unit | PASS |
| 3 | Deleted dishes / non-positive quantities / malformed rows drop, never throw | same | unit | PASS |
| 4 | An orderId-only confirm resolves lines from the tenant's Convex deployment | `tests/unit/api/loyverse-route.test.ts` | integration | PASS |
| 5 | A platform order never triggers a Convex round trip | same | integration | PASS |
| 6 | Caller-supplied items are preferred over a Convex read | same | integration | PASS |
| 7 | Unconfigured / unreachable / missing order reports `skipped`, not 404 | same | integration | PASS |
| 8 | No Convex or admin read occurs before authorization passes | same | integration | PASS |
| 9 | POS counter sales still push regardless of push mode | same | integration | PASS |
| 10 | Confirm push works from an id alone and never throws | `webnegosyo-app/lib/loyverse-confirm.test.ts` | unit | PASS |
| 11 | Every confirm surface stamps the same receipt reference | same | unit | PASS |
| 12 | No tenant resolved means no push | same | unit | PASS |

## Coverage

```
src/lib/loyverse/convex-order-lines.ts   100%  stmts / 94.59% branch
src/app/api/loyverse/route.ts          97.84%  stmts / 86.84% branch
webnegosyo-app/lib/loyverse-confirm.ts   100%  stmts / 100%   branch
```

Full suites: web `487 passed, 5858 tests`; app `179 suites, 2753 tests, all passing`.
`tsc --noEmit` clean in both roots; `eslint` clean on every changed file.

## Known gaps

- **Two pre-existing failures in the web suite are not from this work**:
  `tests/unit/order-create-parity.test.ts` and `tests/unit/vouchers/engine-parity.test.ts`
  are in-progress RED reproducers from a concurrent session (commit `88aa2d4`,
  plus uncommitted changes to `orders.ts` / `orders-service.ts` / `order-parity.ts`).
  Verified untouched by this change.
- **Screen wiring is not unit-tested.** The three call sites are verified by
  typecheck, lint and reading; the behavior they invoke is covered by #10–12.
  Testing Expo Router screens directly would need a render harness this repo does
  not have for these screens.
- **Convex orders still have no idempotency row.** Their once-only guarantee
  remains the pending→confirmed status transition (pre-existing design, unchanged).
  Two devices confirming the same pending order in the same instant could double-push.
  A true fix needs a Convex schema bump.
- **Not covered: tenants whose orders live in their own Supabase project.** Those
  orders are in neither store the server can read back, so an id-only confirm from
  those tenants reports `skipped`. Same limitation as `/api/inventory/customer-order-stock`.

## To reach real devices

The server half deploys with Vercel and takes effect immediately. **The app half
needs an EAS rebuild** — the orders list and register drawer will keep skipping
Loyverse on installed builds until then.
