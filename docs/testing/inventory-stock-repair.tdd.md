# TDD Evidence — Inventory Stock & Deduction Repair

**Date:** 2026-08-15 · **Branch:** main · **Commits:** `f1a6ee0..885dc25` (12 checkpoint commits, test-then-fix pairs per lane)

## Source plan

Inline plan produced via `/ecc:plan` in-session (no `.plan.md` artifact); confirmed by the user via `/ecc:tdd-workflow proceed`. Journeys were derived from two codebase/live-DB investigations.

## Root-cause finding (reframed the work)

The deduction machinery was internally consistent but had **never executed in production**: the live platform DB held 0 `recipes` / 0 `recipe_components` / 0 `order_stock_applications` rows. Deduction is recipe-driven, the merchant app had no recipe editor, and the web editor required save-then-reopen. Verified NOT broken before starting: unit conversions, the `apply_stock_movement` trigger, idempotency claims, ledger-vs-qty consistency, and migration application (all inventory migrations live).

## User journeys

1. A merchant creates a dish and links its ingredients in the same flow (web) or from the product screen (merchant app), so selling it deducts stock.
2. A customer orders from the white-label app on a Convex-backend tenant and the ingredients are deducted.
3. A cashier cancels an order from the app's order list (not just the detail screen) and stock is restored.
4. A POS sale with an addon deducts the addon's recipe; a bundle order deducts the chosen variation/addon recipes.
5. An admin un-cancels an order and the deduction is re-applied; cancelling immediately after ringing never strands a deduction.
6. An admin receives/wastes/counts stock against a specific branch, and sees a warning when the ledger drifts.

## Task report

| # | Guarantee | Test file (representative names) | Type | RED evidence | GREEN evidence |
|---|---|---|---|---|---|
| 1 | Convex-tenant customer-app orders deplete server-side (trust boundary kept: client sends only ids; items fetched from tenant Convex; payload items ignored) | `tests/unit/api/inventory-customer-order-stock.test.ts`, `inventory-customer-order-items.test.ts`, `mobile-checkout-convex-stock.test.ts` | integration/unit | route 404'd Convex orders; `buildDepletionItemsFromConvexOrderItems is not a function` | 34 tests pass (commit `ee660d7`) |
| 2 | Merchant-app order-LIST cancel restores stock via shared `restoreStockForStatusChange`; detail screen uses same path | `webnegosyo-app/lib/order-cancel-stock.test.ts` | unit + source guardrail | `TS2307: Cannot find module './order-cancel-stock'` | app suite green (commit `4a13bea`) |
| 3 | POS sales deplete addon recipes; revision keys distinguish addon sets; route maps `addonIds` through deplete AND revise | `webnegosyo-app/lib/pos-stock.test.ts`, `pos-stock-revision.test.ts`, `tests/unit/api/inventory-order-stock.test.ts` | unit/integration | `- "addonIds": ["add-cheese"] / + []` (the hardcoded empty array) | 40 root + 96 app tests (commit `4a13bea`) |
| 4 | Web bundle order items carry `option_ids`/`addon_ids` (`flattenBundleOrderItems`, price/qty pinned to old inline loop) | `tests/unit/checkout-bundle-order-items.test.ts`, `inventory-order-selection.test.ts` | unit | `Cannot find module 'bundle-order-items'` | same run (commit `4a13bea`) |
| 5 | Un-cancel re-depletes at maxRevision+1; cancel/un-cancel cycles never collide; second cancel restores exactly the net | `tests/unit/inventory-order-stock-redeplete.test.ts`, `orders-service-uncancel-stock.test.ts` | unit | `redepleteOrderStockBestEffort is not a function`; wiring `Number of calls: 0` | 27 new tests; sweep 1170 (commit `dc81266`) |
| 6 | Reverse claims void BEFORE reading movements; sale path defers to an existing void claim (cancel-first ⇒ zero net movement) | `tests/unit/inventory-order-stock-cancel-race.test.ts` | unit | race tests failed pre-fix | same run (commit `dc81266`) |
| 7 | Menu-item create flow offers "Link ingredients now"; menu list badges recipe-less items (failed read withholds badges) | `tests/unit/menu-item-save-flow.test.ts`, `inventory-recipe-link.test.ts`, `menu-items-list-recipe-link.test.tsx` | unit/component | `Cannot find module '@/lib/menu-item-save-flow'` | 207 tests (commit `d1fb8f6`) |
| 8 | Web movements/counts are branch-aware; explicit outlet honored + tenant-ownership guard; no-outlet tenants unchanged | `tests/unit/inventory-stock-form.test.ts`, `inventory-stock-outlet.test.ts`, `inventory-movement-outlet-guard.test.ts` | unit | outlet threading `Received: undefined` | same run (commit `d1fb8f6`) |
| 9 | Merchant app has a recipe editor (service CRUD, permission-gated route, no-recipe hint); direct Supabase writes under existing tenant-admin RLS | `webnegosyo-app/lib/recipe-service.test.ts`, `recipe-screen-mount.test.ts` | unit + guardrail | `TS2307/TS2305` compile-RED | 68 tests (commit `5e6c336`) |
| 10 | Best-effort stock failures report to Sentry (tenant/order/operation/revision tags, never-throw kept); admin sees roll-up-vs-branch drift banner (store-wide accounts only) | `tests/unit/inventory-stock-failure-report.test.ts`, `inventory-stock-failure-sentry.test.ts`, `inventory-reconciliation.test.ts` | unit | missing modules; Sentry `Number of calls: 0` | 22 tests; sweep 1178 (commit `885dc25`) |

## Final validation runs

- Root inventory/order-stock sweep: **102 suites passed, 1 pre-existing skip; 1,178 passed / 8 pre-existing skips** (`npm test -- --testPathPatterns="inventory|order-stock"`).
- Merchant app full suite: **178 suites / 2,744 tests, all pass** (`npx jest` in `webnegosyo-app/`).
- Root full suite: 487/490 suites pass. The 2 failing suites (`order-create-parity`, `vouchers/engine-parity`) are a **different concurrent session's** committed RED reproducers (commit `88aa2d4`, checkout parity / `clientOrderId`) with that session's uncommitted `src/app/actions/orders.ts` edit in flight — unrelated to inventory and failing before this work began.
- ESLint: 0 errors on every changed file (2 pre-existing warnings in `mobile/app/(main)/checkout.tsx`; repo-wide errors exist only in `webnegosyo-desktop/`, untouched).

## Known gaps / deferred

- App recipe editor covers base `menu_item` recipes only; variation/addon/prep recipes are web-only for now.
- Convex depletion route is proven against a mocked Convex client; live end-to-end unproven (consistent with how the platform path shipped). Per-tenant-Supabase order tenants remain uncovered by the customer route (documented in its header).
- Cancel-race closure is deterministic at the claim level; the microsecond check-then-insert window is not provably closed without a Postgres-side transaction (documented in `order-stock-service.ts` tests).
- Drift banner dismiss is per-visit; branch-account admins don't see it (partial RLS view would false-positive).
- Coverage: targeted suites only; repo has no enforced global threshold — inventory modules are densely covered (1,178 tests) but a formal coverage run was not executed this session.
