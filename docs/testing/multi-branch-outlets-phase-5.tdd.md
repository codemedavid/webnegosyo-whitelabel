# TDD evidence — Multi-branch Phase 5: recording the branch on an order

**Branch**: `feat/platform-supabase-order-parity`
**Source plan**: the multi-branch spec supplied in the `/ecc:plan` run for this feature. Phase 5 covers "Orders must record which outlet they belong to" and the analytics line under "State, persistence, and edge cases".

## Decision recorded: the branch travels in `customer_data`, not in a new column on every backend

The original sketch for this phase was "add optional `outletId`/`outletName` to Convex, bump `CURRENT_SCHEMA_VERSION` to 14, prebundle". That was not shipped, and the reason matters.

Orders live in one of three places, and this repo can only migrate one of them on demand:

| Backend | Schema control | Outlet column? |
|---|---|---|
| Platform Supabase | migration already applied (`20260730120000`) | **yes** — `orders.outlet_id` |
| Tenant's own Supabase | versioned SQL bundle, `SUPABASE_ORDER_SCHEMA_VERSION` | no |
| Convex | per-tenant deployment, `CURRENT_SCHEMA_VERSION` | no |

For the latter two, adding a column means bumping a schema version and requiring every affected merchant to redeploy. Until they did, an order carrying the new field would be **rejected by the deployed validator** — meaning turning on multi-branch would break checkout for those tenants until someone clicked a deploy button. That trades a working feature for an operational trap.

So the branch rides inside `customer_data`, which is `v.any()` on Convex and `jsonb` on both Supabase shapes. This is not a new idea here — it is the third use of the same carrier, after the advance-order schedule and the payment proof, both of which cite the identical reason in `src/lib/orders-service.ts`. It works on every tenant deployment that exists today with zero redeploys.

The platform database additionally gets the real `outlet_id` column, because it already has one and it is the indexed form that later per-branch reporting will query. The `customer_data` copy is a **snapshot** of the branch name at order time, in the same spirit as `payment_method_name` — a branch renamed next year does not rewrite last year's receipts.

**Flagged for your call**: when per-branch reporting is needed on Convex, that is the moment to promote the field to a real column and bump the version. Doing it now buys nothing and costs a forced redeploy of every Convex tenant.

## User journeys

1. As a merchant with branches, I want each order to record which branch took it, so that I can tell my outlets apart later.
2. As a merchant, I want the branch recorded no matter which database my orders live in, so that my backend choice does not cost me the feature.
3. As a merchant who never enabled branches, I want my orders written exactly as they are today, with no new field and no new query.
4. As the platform, I want a browser's claim about which branch it chose re-checked on the server, so that nobody can attach another restaurant's branch to an order.
5. As a merchant, I want an order to still be recorded against a branch I hid a minute ago, so that a mid-checkout change does not silently lose the sale's attribution.

## Task report

### Task 1 — decide the branch, on the server

`src/lib/outlets/order-outlet.ts` is pure: no database, no throw. `resolveOrderOutlet` turns the browser's claim into a fact or into nothing; `withOrderOutlet` stamps it onto the order payload.

- **RED**: `npx jest --testPathPatterns="outlets-order-outlet"` → `Cannot find module '../../src/lib/outlets/order-outlet'`, `Test Suites: 1 failed`, `Tests: 0 total`. Committed as `6142a89`.
- **GREEN**: same command → `Tests: 18 passed, 18 total`.

The security-relevant guarantee is that the outlet list handed to the resolver is produced by a query already filtered `.eq('tenant_id', tenantId)`, so an id that is not in it is by construction not this merchant's branch. It is dropped rather than written.

### Task 2 — write it through all three backends

`createOrderAction` gained one trailing optional `outletId`. It resolves the branch once, then:

- **customer_data** — stamped for all three backends via `withOrderOutlet`, before `convexCustomerData` is derived from it.
- **platform `orders.outlet_id`** — passed to `createOrder` as a new trailing param, spread into the INSERT as `...(outletId ? { outlet_id: outletId } : {})` so a single-location tenant's statement is character-for-character the one it issues today.

The outlets query is guarded by `isMultiBranchEnabled(tenantConfig) && outletId` — **both** — so a tenant without the feature, and a tenant with the feature whose customer sent no branch, issue no additional query.

Before adding `multi_branch_enabled` to the tenant SELECT, the column was verified to exist in the live database. This projection is the hazard recorded in `storefront-select-migration-drift`: a column named in a SELECT that does not exist makes the *whole query* fail, which here would mean every order failing for every tenant.

```sql
select table_name, column_name from information_schema.columns
where (table_name='tenants' and column_name='multi_branch_enabled')
   or (table_name='orders' and column_name='outlet_id');
-- → both rows returned
```

### Task 3 — the client side

`useCheckout` reads the branch at submit time from `readOutletSelection` — the same storage the picker writes to — rather than drilling a new prop through the checkout tree. Gated on `isMultiBranchEnabled(tenant)`, so a tenant without the feature does not even touch `localStorage`. The value is a hint; the server does not trust it.

### Task 4 — analytics

`outletId` is added to the metadata object of the existing `upsell_converted` event, spread conditionally so the key is **absent** (not null) for tenants without branches. No event name changed, no existing key changed, no new event introduced.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | A tenant without the flag records no branch, even if a stale tab sends one | `outlets-order-outlet.test.ts:records no branch even for an id that would otherwise resolve` | PASS |
| 2 | No branch is recorded when the client sent none | `outlets-order-outlet.test.ts:records no branch when the client sent none` | PASS |
| 3 | An explicit null records no branch | `outlets-order-outlet.test.ts:records no branch for an explicit null` | PASS |
| 4 | An empty id records no branch | `outlets-order-outlet.test.ts:records no branch for an empty id` | PASS |
| 5 | A whitespace-only id records no branch | `outlets-order-outlet.test.ts:records no branch for a whitespace-only id` | PASS |
| 6 | A tenant with no branches records none | `outlets-order-outlet.test.ts:records no branch when the tenant has no branches at all` | PASS |
| 7 | A real branch is recorded with its name | `outlets-order-outlet.test.ts:records the branch, carrying its name for the order record` | PASS |
| 8 | The branch recorded is the one chosen, not the first listed | `outlets-order-outlet.test.ts:picks the branch the customer chose, not merely the first one` | PASS |
| 9 | Surrounding whitespace on the id is tolerated | `outlets-order-outlet.test.ts:tolerates an id that arrived with surrounding whitespace` | PASS |
| 10 | A branch hidden mid-checkout still gets the sale | `outlets-order-outlet.test.ts:still records a branch the merchant hid mid-checkout` | PASS |
| 11 | Another restaurant's branch id is refused | `outlets-order-outlet.test.ts:refuses an id belonging to another restaurant` | PASS |
| 12 | A fabricated id is refused | `outlets-order-outlet.test.ts:refuses a fabricated id` | PASS |
| 13 | The branch is stamped onto the order payload | `outlets-order-outlet.test.ts:stamps the branch onto the order payload` | PASS |
| 14 | A payload is built when the order carried none | `outlets-order-outlet.test.ts:builds a payload when the order carried none` | PASS |
| 15 | The caller's payload is never mutated | `outlets-order-outlet.test.ts:leaves the payload it was handed untouched` | PASS |
| 16 | With no branch, the payload is the *same object* — no added key | `outlets-order-outlet.test.ts:hands back the exact same payload when there is no branch` | PASS |
| 17 | An absent payload stays absent | `outlets-order-outlet.test.ts:leaves an absent payload absent when there is no branch` | PASS |
| 18 | A client-claimed `outlet_id` is overwritten by the server's answer | `outlets-order-outlet.test.ts:overwrites a branch the client tried to claim for itself` | PASS |

## Regression proof (flag OFF)

- **No new query.** The outlets lookup is behind `isMultiBranchEnabled(tenantConfig) && outletId`.
- **No new column in the INSERT.** Spread-guarded, so the statement is unchanged.
- **No new key in `customer_data`.** Test 16 asserts identity (`toBe`), not equality — `withOrderOutlet` returns the caller's own object when no branch resolved, so no `outlet_id: null` can appear in any existing tenant's order record.
- **No new client work.** `useCheckout` does not read `localStorage` unless the flag is on.
- **One extra column in the tenant SELECT** (`multi_branch_enabled`), verified present in the live database before shipping.
- Full suite: `npx jest` → `Test Suites: 1 skipped, 256 passed, 256 of 257 total`, `Tests: 8 skipped, 3123 passed, 3131 total`.

## Coverage

```
npx jest --coverage --collectCoverageFrom="src/lib/outlets/**/*.ts" --testPathPatterns="outlets"
 order-outlet.ts       | 100 | 100 | 100 | 100 |
 deep-link.ts          | 100 | 100 | 100 | 100 |
 outlet-selection.ts   | 100 | 100 | 100 | 100 |
 nearest-outlet.ts     | 100 | 100 | 100 | 100 |
 reserved-slugs.ts     | 100 | 100 | 100 | 100 |
 All files             | 89.43 | 99.29 | 98.3 | 89.43 |
```

The shortfall is `supabase-outlet-repository.ts`, still at 0% — it needs a live database and is carried over from Phase 2.

`npx tsc --noEmit` → 0 errors under `src/` (24 pre-existing test-file errors unchanged). `npx eslint` → 0 errors on all four changed files (one pre-existing `exhaustive-deps` warning in `useCheckout.ts:362`, untouched).

## Known gaps

- **No test proves the wiring**, only the decision. That the resolver's answer actually reaches each of the three writers is verified by reading and by types, not by an executed test. The action needs heavy mocking (admin client, three backends) that no existing test in this repo sets up.
- **The customer mobile app does not send a branch.** It writes to the platform `orders` table directly and never passes through `createOrderAction` — the same seam already documented for inventory depletion. Its orders will record `outlet_id` as null.
- **The QR-handoff checkout path is not covered.** `useCheckout` skips `createOrderAction` entirely for QR orders, so those record no branch.
- **Nothing reads the branch back yet.** Admin order lists, order detail, and analytics dashboards do not display or filter by branch. That is deliberate — writing has to be correct and deployed before reading is worth building.
- **Never exercised in a browser.** Phases 2, 3, 4 and now 5 have all shipped without the flag being turned on for a real tenant.

## Merge evidence

- RED `6142a89` — `test: add reproducers for recording an order's branch`
- GREEN `d0b9770` — `feat: record which branch took each order`
- No refactor commit; none was needed.
