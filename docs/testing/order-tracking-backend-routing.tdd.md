# Order tracking said "Order Not Found" seconds after checkout

**Date:** 2026-09-13
**Source plan:** none — journeys derived during this TDD run from the reported symptom
("on the tracking order it shows the order is not found even though we clicked on the
track order after ordering").

---

## The defect

Checkout picks a store's order backend with `resolveOrderBackend`
(`src/lib/order-backend.ts`), a **three-way** decision:

1. a deliberate `order_backend` pin (`platform` / `convex` / `supabase`) always wins;
2. otherwise (`auto`, null, legacy) derive it from the credentials on the row —
   a Convex deployment URL means Convex, else the shared platform database.

The tracking **read** (`src/lib/order-tracking-service.ts`) made a **two-way** decision
off the credentials alone: `convex_deployment_url` present + a deploy key ⇒ Convex.

So a store pinned to `platform` that still carried a Convex deployment URL from an
earlier setup had its orders **written to the platform database and looked up in
Convex**. Convex answered "no such order", `fetchOrderTrackingContext` threw, the SSR
page fell through to its localStorage fallback, that fallback asked
`/api/orders/track` and got the same 404, and the customer was shown **"Order Not
Found"** on a link they had been handed seconds earlier.

`src/lib/order-contact-service.ts` (the receipt-QR contact capture that also feeds the
loyalty stamp claim) routed the same wrong way, for the same reason.

### Blast radius, measured against the live platform database

```sql
select count(*) from tenants
where is_active and order_backend = 'platform'
  and convex_deployment_url is not null and convex_deployment_url <> '';
-- 13
```

All 13 have a `convex_deploy_key` in `tenant_secrets`, so all 13 took the Convex
branch. Six of them have real orders in the platform database, the busiest with 734
(most recent the same day the bug was reported). Every one of those orders was
untrackable, and every receipt-QR contact capture and loyalty stamp claim on them
failed too.

Tenants on `order_backend = 'supabase'` (their own Supabase project) were misrouted the
same way in the other direction — tracking read the shared platform database. There are
zero such tenants today; the branch is implemented rather than left silently wrong.

---

## User journeys

1. As a customer, I want to tap "Track Your Order" right after checking out and see my
   order's status, **so that** I know the restaurant received it.
2. As a customer who scans the QR on a printed receipt, I want to leave my number and
   claim my loyalty stamp, **so that** a counter sale still counts toward my card.
3. As a platform operator, I want a store's reads and writes to agree on which database
   holds its orders, **so that** re-pinning a backend cannot make live orders vanish
   from the customer's view.

---

## Task report

| # | Task | Validation command | Result |
|---|------|--------------------|--------|
| 1 | Reproduce the misroute in `fetchOrderTrackingData` | `npx jest --config jest.config.cjs tests/unit/order-tracking-backend-routing.test.ts` | **RED** — 1 failed, 4 passed |
| 2 | Route the tracking read through `resolveOrderBackend` | same command | **GREEN** — 5 passed |
| 3 | Reproduce the same misroute in `updateOrderContact` | `npx jest --config jest.config.cjs tests/unit/order-contact-backend-routing.test.ts` | **RED** — 1 failed, 2 passed |
| 4 | Route the contact write through `resolveOrderBackend` | same command | **GREEN** — 3 passed |
| 5 | Keep the loyalty stamp reader compiling against the widened backend union | `npx tsc --noEmit` | no errors under `src/` |

### RED evidence (task 1)

```
console.error
  [Order Tracking] Error: Order not found in Convex

● order tracking reads the backend checkout wrote to
  › reads the platform database for a tenant pinned to platform that still has a Convex deployment

  expect(received).toBeNull()
  Received: "Order not found"

Tests: 1 failed, 4 passed, 5 total
```

The failure is the defect itself: a platform-pinned tenant whose order sits in the
platform database was looked up in Convex.

### GREEN evidence (tasks 2 and 4)

```
PASS tests/unit/order-contact-backend-routing.test.ts
PASS tests/unit/order-tracking-backend-routing.test.ts
Tests: 8 passed, 8 total
```

---

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A tenant pinned to `platform` that still carries a Convex URL has its order read from the platform database, and Convex is never contacted | `order-tracking-backend-routing.test.ts:reads the platform database for a tenant pinned to platform…` | unit | PASS |
| 2 | An unpinned (`auto`) tenant with a Convex deployment is read from Convex | `order-tracking-backend-routing.test.ts:reads Convex for an unpinned tenant…` | unit | PASS |
| 3 | A tenant deliberately pinned to `convex` is read from Convex | `order-tracking-backend-routing.test.ts:reads Convex for a tenant deliberately pinned to Convex` | unit | PASS |
| 4 | A tenant with no per-tenant backend at all is read from the platform database | `order-tracking-backend-routing.test.ts:reads the platform database for a tenant with no per-tenant backend at all` | unit | PASS |
| 5 | An unreadable tenant row reports "Restaurant not found" rather than guessing a backend | `order-tracking-backend-routing.test.ts:reports the order missing rather than guessing…` | unit | PASS |
| 6 | Receipt-QR contact capture writes to the platform database for a platform-pinned tenant with a Convex URL | `order-contact-backend-routing.test.ts:writes to the platform database for a tenant pinned to platform…` | unit | PASS |
| 7 | Receipt-QR contact capture writes to Convex for an unpinned Convex tenant | `order-contact-backend-routing.test.ts:writes to Convex for an unpinned tenant…` | unit | PASS |
| 8 | Receipt-QR contact capture writes to the platform database for a tenant with no per-tenant backend | `order-contact-backend-routing.test.ts:writes to the platform database for a tenant with no per-tenant backend at all` | unit | PASS |

The pre-existing `order-backend*.test.ts` family (59 tests) pins the resolver itself and
still passes, so the read now inherits every rule the write already obeyed.

---

## Coverage

```
npx jest --config jest.config.cjs --coverage \
  --collectCoverageFrom='src/lib/order-tracking-service.ts' \
  --collectCoverageFrom='src/lib/order-contact-service.ts' \
  --collectCoverageFrom='src/lib/order-backend.ts' \
  tests/unit/order-tracking-backend-routing.test.ts \
  tests/unit/order-contact-backend-routing.test.ts \
  tests/unit/order-backend*.test.ts tests/unit/order-contact.test.ts
```

| File | % Stmts | % Branch | % Funcs |
|------|---------|----------|---------|
| `order-backend.ts` (the routing decision) | 100 | 100 | 100 |
| `order-tracking-service.ts` | 89.28 | 41.02 | 88.88 |
| `order-contact-service.ts` | 69.23 | 36.84 | 80 |
| **All three** | **86.17** | 61.95 | 91.3 |

Branch coverage is below the 80% target on the two service files. The uncovered branches
are the Convex mutation body, the loyalty projection side-effects, and the
tenant-Supabase read — side-effect paths that need real backends, not routing logic. The
routing decision these tests exist to protect is at 100%.

---

## Known gaps

- **The tenant-Supabase read path (`order_backend = 'supabase'`) is implemented but
  unexercised** — no active tenant uses it. It reuses `fetchTenantOrderById` with the
  anon-key client and shares the row mapper with the platform path, so it cannot drift
  independently, but it has never run against a real tenant project.
- **`/api/orders/track-by-client` remains Convex-only.** That is the QR-handoff poll, a
  Convex-native feature that returns `{ found: false }` when a store has no Convex; it is
  a different surface, not this bug.
- **Configuration question left for the operator:** the 13 drifted tenants are now
  *consistent* (checkout, admin queue, and tracking all read the platform database), but
  whether `platform` is the pin those stores actually want is a merchant-config decision,
  not a code one. A store whose merchant app expects Convex would still be split.

---

## Merge evidence

No checkpoint commits were created. The working tree is shared with a concurrent session
holding uncommitted presell work, so branching or committing here would sweep up changes
that are not part of this fix. The RED → GREEN evidence above is the record.

Files changed:

- `src/lib/order-tracking-service.ts` — route on `resolveOrderBackend`; add the
  tenant-Supabase branch; extract `mapSupabaseOrderRow` shared by both Postgres paths
- `src/lib/order-contact-service.ts` — route on `resolveOrderBackend`
- `src/lib/loyalty/order-stamp-service.ts` — accept the full `OrderFactsBackend` union
  as a ledger filter value
- `tests/unit/order-tracking-backend-routing.test.ts` — new
- `tests/unit/order-contact-backend-routing.test.ts` — new

Full suite: `685 suites, 7853 passed, 12 failed`. All 12 failures are in
`inventory-order-stock`, `leads-analytics`, and `mcp-legacy-oauth-routes` — verified
against a detached worktree at pristine `HEAD`: the first two fail there identically
(pre-existing), and `mcp-legacy-oauth-routes` passes at `HEAD`, so its failure comes from
another session's uncommitted edit to `src/app/api/mcp/oauth/authorize/route.ts`. None of
the three import any module touched here.
