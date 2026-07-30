# Per-branch menu and pricing — TDD evidence

**Source plan**: inline `/ecc:plan` output (this session), confirmed with two
decisions: mobile/POS parity is in this build, and per-branch *availability*
("out of stock here") ships alongside per-branch *listing*.

**Branch**: `feat/platform-supabase-order-parity`
**Migration**: `supabase/migrations/20260806120000_outlet_menu_overrides.sql` — **NOT YET APPLIED**

## User journeys

1. As a store owner, I want a dish on one branch's menu and off another's, so each shop lists what it actually sells.
2. As a store owner, I want a dish to cost differently at different branches, so pricing can follow the local market.
3. As a branch manager, I want to mark a dish out of stock at my branch only, so I can 86 it mid-service without calling the owner.
4. As a store owner, I want to see at a glance which dishes differ and where, so per-branch pricing does not become invisible drift.
5. As a customer, I want the price I was shown at a branch to be the price I am charged.
6. As a cashier, I want the register to ring up my branch's price, so the counter and the storefront agree.

## Design in one line

`outlet_menu_items` is an **override-only, opt-out** table: **no row = listed,
available, store-wide price**. No backfill, no behaviour change for any existing
tenant, and a dish added and never assigned appears everywhere (visible) rather
than nowhere (lost revenue).

## Task report

| Phase | What was done | Validation run | Result |
|---|---|---|---|
| 1 | `outlet_menu_items` table, RLS (branch-scoped writes), tenant-match trigger, `OutletMenuOverride` type | `npx tsc --noEmit` | src clean |
| 2 | Pure resolver `src/lib/outlets/outlet-menu-overrides.ts` | `npx jest tests/unit/outlet-menu-overrides.test.ts` | RED (module missing) → **25 passed** |
| 3 | Repository: interface + validation + in-memory + Supabase impls | `npx jest tests/unit/outlet-menu-repository-contract.test.ts` | RED (module missing) → **23 passed** |
| 5 | Order-path price floor rebuilt on the branch-resolved price | `npx jest tests/unit/order-line-price-floor.test.ts` | RED (module missing) → **17 passed** |
| 4 | Storefront: menu-server fetch + `useBranchMenu` + product detail + cart re-check | `npx jest tests/unit/branch-menu-wiring.test.tsx tests/unit/cart-refresh-branch.test.ts` | RED (module missing; 3 failing assertions) → **11 + 4 passed** |
| 6 | Admin: branch Menu tab, item Branches panel, menu-list badge, server actions | `npx jest tests/unit/branch-menu-permissions.test.ts tests/unit/branch-menu-summary-label.test.ts` | RED (7 + 7 failing) → **7 + 7 passed** |
| 7 | Merchant app: ported resolver + branch-aware `listProducts` + register wiring | `cd webnegosyo-app && npx jest lib/products-branch.test.ts` | RED (TS2554, arity) → **4 passed** |

## Two live bugs this fixed

Both were in `src/app/actions/orders.ts`, in the same six lines, and both
**overcharged the customer after checkout**:

1. **Discounts were floored away.** The floor read `menu_items.price` (list
   price) while the cart charges `getEffectiveItemPrice` (sale price). Any
   discounted line was silently raised back to list price on submit.
2. **A cheaper branch was re-priced upward.** With no notion of branches, a
   branch selling below the store-wide price had every line raised to the
   store-wide one — per-branch pricing broken in the exact direction merchants
   use it most.

Both are covered by `tests/unit/order-line-price-floor.test.ts`
("charges the sale price rather than raising it to list", "accepts a branch
price BELOW the store-wide price").

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | No override row leaves the store-wide menu untouched | `outlet-menu-overrides.test.ts` | unit | PASS |
| 2 | A branch price, including a zero (free) price, is honoured | `outlet-menu-overrides.test.ts` | unit | PASS |
| 3 | A branch can opt out of a store-wide sale (`discount_cleared`) | `outlet-menu-overrides.test.ts` | unit | PASS |
| 4 | A store-wide out-of-stock dish stays out of stock at every branch | `outlet-menu-overrides.test.ts` | unit | PASS |
| 5 | An unlisted dish is absent from that branch's menu only | `outlet-menu-overrides.test.ts` | unit | PASS |
| 6 | The owner's cross-branch summary matches what customers are shown | `outlet-menu-overrides.test.ts`, `branch-menu-summary-label.test.ts` | unit | PASS |
| 7 | Writing a branch back to store-wide values leaves NO row | `outlet-menu-repository-contract.test.ts` | unit | PASS |
| 8 | A partial patch never resets fields it did not mention | `outlet-menu-repository-contract.test.ts` | unit | PASS |
| 9 | Contradictory / negative / inverted prices are refused with merchant-readable text | `outlet-menu-repository-contract.test.ts` | unit | PASS |
| 10 | Every column of `OutletMenuOverride` is in the SELECT projection | `outlet-menu-repository-contract.test.ts` | unit | PASS |
| 11 | An order line is floored at the branch-and-discount-aware price | `order-line-price-floor.test.ts` | unit | PASS |
| 12 | An order for a dish the branch does not carry / has 86'd is refused | `order-line-price-floor.test.ts` | unit | PASS |
| 13 | The storefront fetches overrides and renders through the resolver | `branch-menu-wiring.test.tsx` | wiring guardrail | PASS |
| 14 | An override load failure is carried, not read as agreement | `branch-menu-wiring.test.tsx` | wiring guardrail | PASS |
| 15 | The cart's re-check prices against the cart's branch | `cart-refresh-branch.test.ts` | unit | PASS |
| 16 | A branch admin manages its own branch's menu and no other | `branch-menu-permissions.test.ts` | unit | PASS |
| 17 | The register rings up its own branch's prices and menu | `webnegosyo-app/lib/products-branch.test.ts` | unit | PASS |

## Coverage and regression runs

```
npx jest tests/unit                  → 309 suites, 3842 tests, all passing
cd webnegosyo-app && npx jest        →  90 suites, 1469 tests, all passing
npx tsc --noEmit                     → no errors in src/ (pre-existing test-file errors unchanged)
npm run lint                         → no new errors in changed files
```

## Known gaps — deliberate

- **The migration is not applied.** Until it is, `outlet_menu_items` does not
  exist; every read is flag-gated on `multi_branch_enabled`, so a tenant without
  branches is unaffected either way, but a multi-branch tenant will log the
  carried "branch menu query failed" warning and block ordering until it lands.
- **The white-labeled customer app (`mobile/`) is untouched.** It has no outlet
  or `multi_branch` support at all — zero matches across the whole project — so
  there is no branch to price against. Porting the resolver there would be dead
  code until multi-branch itself is ported. The merchant app / POS, which does
  have branches, is done.
- **Per-branch variations, add-ons, images and categories** are out of scope;
  only base price, sale price, listing and availability are per-branch.
- **The Supabase repository implementation is not exercised against a live
  database** — same position as `outlet-repository.ts`, whose contract test also
  runs only the in-memory implementation.
- **No E2E test.** The journeys above were verified by unit + wiring tests only.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`, in order:

```
a9940f5 test: add reproducer for per-branch menu and pricing resolution   (RED)
00f140c feat: resolve a dish's price and listing for one branch           (GREEN)
a30717d feat: store per-branch menu overrides behind one repository       (RED→GREEN)
301dcc9 fix: charge the price the customer was shown at their branch      (RED→GREEN)
95e01f8 feat: show each branch its own menu and prices                    (RED→GREEN)
5ccf3f5 feat: let the owner see and set each branch's menu                (RED→GREEN)
5827b60 feat: ring up the branch's own prices on the register             (RED→GREEN)
```
