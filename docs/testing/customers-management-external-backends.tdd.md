# TDD evidence — Customers management: external-backend capture + insights

**Task:** "Customers management isn't working. We have phone numbers available on
Convex but it's not going on the customers database. Plus it should show us the
frequency of that client and the most ordered / favourite of that customer. Plus
the LTV of that customer."

**Source plan:** none — journeys derived during this TDD run from the reported bug.

**Branch:** `feat/unified-modifier-groups`
**Checkpoints:** `a7cc755` (RED) → `145e5c1` (GREEN) → `2597418` (backfill)

---

## Root cause

`upsertCustomerFromOrder` was wired into exactly one order path:
`createOrder` (platform Supabase). Orders written to a tenant's **own** backend
never reached it.

| Backend | New orders land in | `customers` populated before this change? |
|---|---|---|
| platform Supabase | `public.orders` | yes |
| Convex | tenant's Convex deployment | **no** |
| tenant Supabase | tenant's own project | **no** |

Confirmed against production: Convex tenants (Oester's, Sample Demo, GND) had
customer rows only from *legacy* platform orders — their most recent
`public.orders` row was months old, while live orders kept flowing into Convex.
The phone numbers existed in Convex and nowhere else.

The existing capture recomputes a profile from the orders linked via
`public.orders.customer_id`, which structurally cannot see foreign orders.

## User journeys

1. As a merchant on Convex, when a customer orders with their phone number, I want
   them to appear in my Customers list, so my regulars list keeps growing.
2. As a merchant, I want to see how often a customer comes back, so I know who my
   regulars are.
3. As a merchant, I want to see what a customer always orders, so I can recommend
   and upsell.
4. As a merchant, I want to see what a customer is worth, so I know who to retain.
5. As a merchant who has been on Convex for months, I want my existing order
   history to produce customers too, not just orders from today onward.

## Design

A minimal platform-side **ledger** (`customer_external_orders`) holding only the
facts a profile is derived from — who, how much, when, which channel, which items.
Deliberately *not* an order mirror: no statuses, payments, or addresses; the
tenant's own backend stays the source of truth for fulfilment.

`(tenant_id, backend, external_order_id)` is unique, so the ledger becomes the
"orders" set for those customers and the **existing recompute-then-save
orchestration applies unchanged** — inheriting its idempotency rather than
re-inventing it.

## Task report

| Task | Validation command | Result |
|---|---|---|
| Reproduce the gap | `npx jest --testPathPatterns="customer-insights\|customer-external-orders\|customers-list"` | RED — 3 suites failed, 5 tests failed, 12 passed |
| Ledger + capture adapter | same | GREEN |
| Insights module | same | GREEN |
| List UI surfaces all three | same | GREEN |
| Convex backfill mapper | `npx jest --testPathPatterns="customers-backfill-external"` | RED (module not found) → GREEN, 5 passed |
| Full regression | `npx jest` | 213 passed / 2 failed (pre-existing, see gaps) |
| Production backfill | `npm run db:backfill-customers-convex -- --execute` | 45 tenants, 577 scanned, 46 identified, 0 failed |

### RED evidence (commit `a7cc755`)

```
FAIL tests/unit/customer-insights.test.ts
  ● Test suite failed to run
    Cannot find module '../../src/lib/customer-insights'
FAIL tests/unit/customer-external-orders.test.ts
  ● Test suite failed to run
    Cannot find module '../../src/lib/customer-external-orders'
FAIL tests/unit/customers-list.test.tsx
  ● shows how often a repeat customer orders
    Unable to find an element by: [data-testid="customer-frequency-cust-1"]

Test Suites: 3 failed, 3 total
Tests:       5 failed, 12 passed, 17 total
```

### GREEN evidence (commit `145e5c1`)

```
$ npx jest --testPathPatterns=customer
Test Suites: 14 passed, 14 total
Tests:       139 passed, 139 total
```

### Production verification

```
$ npm run db:backfill-customers-convex -- --execute
✅ Done. 45 tenant(s): scanned 577, identified 46, anonymous 531, failed 0.
```

Persisted result (`customer_external_orders` joined to `customers`):

```
ledger_rows | customers | revenue   | max_order_count
         46 |        34 | 12,409.96 |               7
```

Sample recovered profile — previously invisible to the merchant:

```
name: "Customer 1"  phone: +639696233888  orders: 7  spent: ₱1,468.00  avg: ₱209.71
channels: [Pick Up]
top_items: Lechon Manok Whole ×3, Chocolate Chip Brownies ×2, Pork Barbecue Stick ×2, …
```

**Idempotency proven at the system level:** the `--execute` sweep was run twice.
Counts after the second run were byte-identical (46 rows / 34 customers /
₱12,409.96 / max order_count 7) — no double-counting.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A Convex order with a phone creates a customer with the normalized E.164 identity | `customer-external-orders.test.ts:creates a customer from a Convex order with a phone number` | unit | PASS |
| 2 | A phone hidden in `customerData` is still recovered when `customerContact` is blank | `…:recovers the phone from customerData when the contact field is blank` | unit | PASS |
| 3 | Two orders from one person (differently formatted phones) join into one profile with summed spend, merged channels, merged item tallies | `…:joins a second order onto the same customer and grows the profile` | unit | PASS |
| 4 | Replaying the same external order never double-counts | `…:is idempotent — replaying the same external order never double-counts` | unit | PASS |
| 5 | The same order id in two backends stays two distinct ledger rows | `…:keeps the same external order id separate across backends` | unit | PASS |
| 6 | An anonymous walk-in never becomes a customer and writes no ledger row | `…:never creates a customer for an anonymous walk-in order` | unit | PASS |
| 7 | SMS consent carried in `customerData` reaches the profile | `…:records SMS consent carried in customerData` | unit | PASS |
| 8 | Dirty totals / missing items / blank channels coerce to safe defaults | `…:coerces a dirty total and missing items to safe defaults` | unit | PASS |
| 9 | Convex epoch-millisecond creation times map to ISO | `…:accepts a Convex epoch-millisecond creation time` | unit | PASS |
| 10 | The favourite item is the true maximum, independent of stored array order | `customer-insights.test.ts:ignores stored ordering and picks the true maximum` | unit | PASS |
| 11 | Cadence is the mean gap across the customer's own lifespan | `…:averages the gap between orders across the customer lifespan` | unit | PASS |
| 12 | A one-order customer gets "First-time", not a fabricated cadence | `…:reports a first-time customer instead of a cadence` | unit | PASS |
| 13 | Several orders on one day yield "Repeat", not a divide-by-zero cadence | `…:labels a repeat customer whose orders all landed on the same day` | unit | PASS |
| 14 | Lifetime value is actual spend; the 12-month projection derives from cadence × AOV | `…:projects a 12-month value from cadence and average order value` | unit | PASS |
| 15 | With no cadence, the projection honestly falls back to actual spend | `…:falls back to actual spend when no cadence can be derived` | unit | PASS |
| 16 | Postgres `numeric` strings coerce correctly | `…:coerces string numerics from Postgres numeric columns` | unit | PASS |
| 17 | Engagement status tracks silence against the customer's own cadence (new / active / at_risk / lapsed) | `…:engagement status` (4 tests) | unit | PASS |
| 18 | The list row shows cadence, favourite item, and lifetime value | `customers-list.test.tsx — customer insights` (6 tests) | unit | PASS |
| 19 | Convex line items bucket by order without an N+1 | `customers-backfill-external.test.ts:buckets line items under their order id` | unit | PASS |
| 20 | Backfill carries `customerData` so legacy blank-contact orders still resolve | `…:carries customerData through so a legacy blank contact can still be resolved` | unit | PASS |

## Coverage and known gaps

Full suite: **213 suites passed, 2 failed; 2568 tests passed, 3 failed.**

The 2 failing suites are **pre-existing and unrelated** —
`webnegosyo-app/lib/printer-native-load.test.ts` and
`webnegosyo-app/lib/order-item-images.test.ts` (a `jest.mock` hoisting bug).
Verified failing identically at commit `a7cc755` with none of this work applied.

Intentional gaps, not covered here:

1. **`getCustomerDetail` order history.** The customer *profile* is now correct for
   every backend, but the per-customer order list on the detail read still queries
   `public.orders` only, so it will be empty for an external-backend customer. The
   list view (what the Customers page renders) is unaffected. Reading the ledger
   there is the natural follow-up.
2. **Low identification rate is genuine, not a bug.** The production dry run
   identified only 46 of 577 Convex orders. Inspection of the raw Convex documents
   showed those tenants' dine-in checkout collects only `customer_name` +
   `table_number` — there is no phone to capture. Where a phone exists it is read
   correctly, and junk values (e.g. `"000000"`) are correctly rejected rather than
   collapsed into a phantom customer. Raising this rate is a checkout-form change,
   not a capture change.
3. **Three tenants were skipped** during the backfill: their Convex deployments are
   disabled ("exceeded the free plan limits"). The sweep logs and continues; re-run
   it after those deployments are restored — it is idempotent.
4. **No E2E test.** The capture path is covered by unit tests plus a verified
   production run rather than a Playwright journey.
