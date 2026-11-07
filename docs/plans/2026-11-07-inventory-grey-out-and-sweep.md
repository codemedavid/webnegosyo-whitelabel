# Inventory: grey-out and bug + security sweep

Status: approved by owner 2026-11-07, building on `fix/inventory-sweep`. Decisions: the rule applies at zero AND below on block stores (not only below zero); block direct order inserts; do NOT import SofiasKitchen's old orders (#17 replaced by a reset whose scope the owner is confirming). Evidence: three read-only audits on 2026-11-07, with the top findings re-checked against code and the live platform database.

## Root cause of "never greyed out"

`src/lib/inventory/judged-shelf.ts` ignores any ingredient with `counted_at` NULL. On SofiasKitchen that is 90 of 92 ingredients, so no dish gets a limit. Every downstream surface (web cards, register hint, Charge prompt, checkout guard, auto-86) already works once a dish has a limit: a counted ingredient at -5 gives a limit of 0.

## Phase 1: the grey-out fix

| # | Change | Where | Ships via |
|---|---|---|---|
| 1 | On a store with `pos_stock_policy = 'block'`, a never-counted ingredient at or below zero counts as out, and a branch with no row reads as zero. Other stores keep today's rule. | `judged-shelf.ts`, `stock-graph-read.ts`, `auto-86-service.ts`, `dish-availability.ts` | web |
| 2 | Re-check the whole menu when auto-86 or the block setting is switched on, since today nothing runs until an ingredient next moves. | `stock-alerts-service.ts`, `auto-86-service.ts`, `actions/pos-stock-policy.ts`, tenant save | web |
| 3 | Refresh the storefront cache after auto-86 hides or restores a dish (today up to 5 minutes stale). | `auto-86-service.ts` | web |
| 4 | Raise an `out` alert for an ingredient judged out with no open alert. Same scope as #1, so other stores get no new pushes. | `stock-alerts-service.ts`, `low-stock.ts` | web |
| 5 | Upsells stop offering a dish with a limit of 0. | `src/lib/boost/offer-items.ts` | web |
| 6 | Register tile looks grey at a limit of 0, not only when `is_available` is false; QR scan runs the same stock prompt as the register (it already refuses sold-out dishes). | `pos-stock-hint.ts`, `ProductTile.tsx`, `scan.tsx` | app OTA |

Why opt in through `block`: it reaches exactly one store today, needs no migration, and only the owner can change it (`guard_tenant_pos_stock_policy`). Applying the rule everywhere would grey dishes on stores that never asked (Keto Lifestyle Cafe, Curbspot, 928 Cafe, Lolys).

Effect on SofiasKitchen: all 24 dishes with recipes go grey at once. A delivery or count brings a dish back automatically. The 64 dishes with no recipe still need recipes or the manual switch. The owner keeps "Sell anyway until end of day" after a prompt; every account gets the prompt.

## Phase 2: security, no customer impact

| # | Severity | Finding | Fix | Migration |
|---|---|---|---|---|
| 7 | HIGH | `/api/inventory/order-stock` trusts lines from the request, so any `pos` staff can add or remove stock through the service role. | Check lines against the stored order, for both backends; keep option ids but verify they belong to the dish. Bound revisions without breaking the offline queue. | no |
| 8 | HIGH | `/api/inventory/customer-order-stock` is public with no rate limit; with direct order inserts (#13) it can drain a store's stock. | Rate limit, line quantity cap, and only act on recent orders from the customer app. | no |
| 9 | HIGH | `order_accepts_anon_items` lets anon add lines to any recent pending order of any store. | Remove the window once #13 ships; until then cap quantity with a trigger. | yes |
| 10 | MEDIUM | `auto_86_enabled` and `low_stock_alerts_enabled` can be changed by staff holding `store_setup`, `settings` or `analytics`. | Add both to `guard_tenant_privileged_columns`. | yes |
| 11 | MEDIUM | Counts, transfers and shelf policies have no permission key (triggers alone enforce it); anon holds table grants; `analytics` staff can edit prices through `menu_items_update_staff`. | Split read and write policies, add keys, revoke anon writes, limit the analytics write. Check what Menu Engineering needs first. | yes |
| 12 | LOW | `/api/inventory/movement` returns raw database errors and has no rate limit; no same-tenant trigger on `stock_movements`. | Friendly errors, rate limit, trigger. | one |

Migrations change policies, grants and triggers only and touch no existing rows. Each is applied, then probed as anon, `authenticated` and service role, asserting affected rows.

## Phase 3: security, needs a decision or a release

| # | Severity | Finding | Fix |
|---|---|---|---|
| 13 | HIGH | `orders_insert_customer` lets anyone insert a pending order directly, skipping price, stock and rate limits. | Web checkout inserts with the service role, then drop the anon policies. Old customer-app builds that insert directly on platform would stop working: 1 of 12,167 platform orders in the last 14 days came from them. |
| 14 | HIGH | `unit_cost` is readable without the `costs` key by querying the database directly. | Move all reads to explicit columns, ship the app, THEN revoke the column. Revoking first breaks every `select('*')` read on `inventory_items`, including installed app builds. |
| 15 | MEDIUM | Customer app has no stock check. | Add it with #13 through a server route. Needs per-store app builds. |

## Phase 4: reliability

| # | Severity | Finding | Fix |
|---|---|---|---|
| 16 | HIGH | Changing `order_backend` strands old orders: a void on a Convex-era order gets 404 and stock is never returned. Nothing warns in the superadmin form. | Serve voids and edits from the stored claim; warn or refuse the switch while claims exist on the other backend. |
| 17 | HIGH | SofiasKitchen: 30 orders and their claims are still on Convex ids. | Import per the Baristro recipe (separate approval: writes live data). |
| 18 | MEDIUM | Counts stay open forever and later lines miss the daily report; 26 open counts older than a day across stores. | Start a new count on a new Manila day; show the age. No rows changed. |
| 19 | MEDIUM | Daily report's count lookup errors silently with several branches. | Read and merge instead of `maybeSingle`. |
| 20 | MEDIUM | 76 of 2,127 recipe lines have a unit that can't convert, so they deduct nothing, quietly. | Refuse at save, report to Sentry. Existing lines are left alone. |
| 21 | MEDIUM | A failed web or Messenger deduction is never retried; alert and auto-86 failures only reach `console.error`. | Cron sweeper for orders with no sale claim; `reportStockFailure`. |
| 22 | - | Not yet reviewed: `execute_order_deletion`, transfers, presell, text-only add-ons, simple-option claims. | Review during this phase and add findings here. |

## Not changing

- Existing negative numbers and duplicate ingredients: owner's count and clean-up, no live data repairs.
- Two carts racing for the last portion can still oversell; Toast accepts the same.
- Offline register sales are never blocked.
- Block is enforced in the app; an old or modified build can skip it. The register writes orders directly, so a server-side refusal would be a separate project.

## Verification

- Branch off `origin/main` in its own worktree, test first (RED then GREEN), web and app suites, `npm run test:sql`, lint, code and security review before merge.
- New rule covered in `tests/unit/` and the existing suites that pin it: `inventory-stock-graph-counted`, `inventory-dish-availability`, `inventory-auto-86-service`, `inventory-menu-ceilings`, `inventory-checkout-stock-guard`, `inventory-alerts-integration`.
- Live check on SofiasKitchen after deploy: count one ingredient to confirm a dish returns, then sell a below-zero dish on the POS and the site as owner and as a cashier.
- Rollout: migrations, web deploy, app OTA. The menu re-check on SofiasKitchen runs at a time the owner picks, not during service.
