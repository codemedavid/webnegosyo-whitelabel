# TDD evidence — depleting stock for customer-app orders (Phase 8)

**Source plan** — no `*.plan.md`. Phase 8 of the inventory roadmap, taken next
because it is a correctness hole rather than a missing feature.

## The finding, which is worse than the note that scheduled it

My own note recorded Phase 8 as *"option-aware depletion for the customer mobile
app — `mobile/` still sends display strings so its orders deplete base recipes
only."* Reading the code, that understates it: **customer-app orders deplete
nothing at all.**

`mobile/app/(main)/checkout.tsx` writes the order directly — to the tenant's
Convex deployment, or straight into the platform `orders` table — and never
calls `createOrderAction`, the one place order-driven depletion is wired. Nor
does it call `/api/inventory/order-stock`, the register's way in. So an order
placed in a merchant's own branded app moved no stock, raised no low-stock
alert, and could never take a sold-out dish off the menu, while the identical
order placed on their website did all three.

## User journeys

1. As a merchant, I want an order from my branded app to spend ingredients just
   like an order from my website, so one shelf figure is true for both.
2. As a merchant, I want a sell-out in the app to raise the same alert and hide
   the same dish, so I am not selling what I cannot cook.
3. As a diner, I want a stock problem on the merchant's side never to make my
   placed order look failed.

## Why the route is unauthenticated, and why that is safe

A diner has no account, so this cannot be gated on a merchant session the way
`/api/inventory/order-stock` is for the register. Making a *public* depletion
endpoint that accepts a list of items and quantities would be a stock-vandalism
vector: anyone could drain a tenant's shelf.

So the route carries **nothing steerable**. The caller names a tenant and an
order; every dish and quantity is read back out of the order the platform
already holds. `items` in the body are ignored — there is an explicit test for
that, because the whole safety argument rests on it. The worst a forged call can
achieve is triggering the depletion that order had already earned, and the
ledger's existing order+direction guard means that happens once.

| | |
|---|---|
| what the caller supplies | `tenantId`, `orderId` |
| what the server derives | the order's existence, its tenant, every line and quantity |
| bound on a forged call | one replay of a real order's own depletion |

## Two limits stated rather than papered over

**Convex-backed and own-Supabase tenants are not covered.** Their orders are not
in the platform `orders` table to be read back, so the same guarantee cannot be
made without trusting the caller's lines — which is the thing this design
refuses. Their customer-app orders still deplete nothing.

**Depletion here is not option-aware.** Nothing persists option ids on an order:
web checkout resolves them in flight (`extractSelectionIds`) and drops them.
Reading them back is impossible and accepting them from the caller is refused,
so base recipes deplete. That is strictly more than the nothing this path spent
before; option-level spend waits on the ids being stored on `order_items`.

## Task report

### 1. `src/lib/inventory/customer-order-items.ts` — the mapping

- RED: `Cannot find module '@/lib/inventory/customer-order-items'`
- GREEN: 5 passed

Lines are never merged — two configurations of one dish spend different
ingredients. A row whose dish was deleted (`menu_item_id` null) is dropped
rather than guessed at.

### 2. `src/app/api/inventory/customer-order-stock/route.ts`

- RED: `Cannot find module '@/app/api/inventory/customer-order-stock/route'`
- GREEN: 7 passed

Best-effort, and it reports success even when the ledger write throws: the order
is placed and the customer is looking at a confirmation, and a diner has no way
to act on a stock error.

### 3. `mobile/lib/order-stock-notify.ts` + the checkout call

Never-throws, fires after the order lines are written — calling earlier would
find an empty order, since the platform reads the lines back rather than
trusting anything sent from the phone.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Each line spends at the quantity the order recorded | `inventory-customer-order-items.test.ts:spends one line per row` | unit | PASS |
| 2 | Two configurations of one dish stay apart | `…:keeps two configurations of one dish apart` | unit | PASS |
| 3 | A deleted dish is dropped, never guessed | `…:drops a row with no menu item` | unit | PASS |
| 4 | Zero, negative and non-numeric quantities are dropped | `…:drops a row with no usable quantity` | unit | PASS |
| 5 | No option ids are invented from a display string | `…:carries no option ids` | unit | PASS |
| 6 | The order's own lines are what gets spent | `api/inventory-customer-order-stock.test.ts:spends the lines the order actually recorded` | integration | PASS |
| 7 | **Lines sent by the caller are ignored** | `…:ignores any lines the caller tries to send` | integration | PASS |
| 8 | Another tenant's order is refused | `…:refuses an order belonging to another tenant` | integration | PASS |
| 9 | A non-existent order is refused | `…:refuses an order that does not exist` | integration | PASS |
| 10 | An inventory-off tenant accumulates no ledger | `…:skips silently for a tenant who never switched inventory on` | integration | PASS |
| 11 | A request naming no order is rejected | `…:rejects a request naming no order` | integration | PASS |
| 12 | A ledger failure never surfaces to the diner | `…:reports success even when the ledger write fails` | integration | PASS |

## Coverage and known gaps

- `npx jest --testPathPatterns=inventory-customer-order` — **12 passed**.
- Full web suite — **255 suites, 3105 passed, 8 skipped**.
- `npx tsc --noEmit` — **0 errors in `src/`** (pre-existing test-file errors only).
- ESLint on both new web files — clean.
- `mobile/` `npx tsc --noEmit` — clean.

**Not covered by tests.** `mobile/` has no test runner at all (no jest config, no
test script), so the notifier and its call site are typechecked but not tested.
Both are deliberately thin for that reason: every rule lives in the web modules
above, which are tested.

**Not verified end to end.** No order has been placed from a customer-app build
against a live tenant.

**Not deployed.** The branch has no upstream. `mobile/` calls
`${webAppUrl}/api/inventory/customer-order-stock`, which does not exist in
production — the call is a harmless swallowed 404 until the branch ships.
