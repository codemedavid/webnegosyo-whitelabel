# TDD Evidence — stale cross-tenant order type hides checkout payment methods

**Source plan**: none — journey derived during this run from a live bug report
("the payments option no longer shows" on customer web checkout).

## User journey

As a customer who previously browsed another store on this platform, I want
checkout to use the current store's order types, so that payment methods and
customer form fields always appear.

## Root cause

The selected order type persists in ONE global localStorage key
(`restaurant_order_type`, `src/hooks/useCart.tsx`) shared across every
tenant, while carts are per-tenant. `useCheckout` initialization trusted the
stored ID blindly (it only replaced it when *empty*), so after visiting
store A, store B's checkout fetched payment methods and customer form fields
with A's order-type ID → zero rows → "No Payment Methods Available", no
customer-info section, no service charge.

Diagnosis was confirmed live: gungjeon-unlimited has exactly one order type
(Dine In: 5 linked methods, 2 form fields), verified as the anon role via
PostgREST — so the reported screenshot (methods + fields both missing) is
only reachable with a foreign order-type ID.

## Task report

1. **Failing test (RED)** — `tests/unit/checkout-order-type.test.ts`
   - Command: `npx jest --roots tests/unit --testPathPatterns="checkout-order-type"`
   - Result: suite failed — `Cannot find module '@/lib/checkout-order-type'`
     (intended missing-implementation failure).
   - Commit: `f755e1fe test: reproduce stale cross-tenant order type hiding checkout payment methods (RED)`
2. **Fix (GREEN)** — `src/lib/checkout-order-type.ts` (`resolveActiveOrderType`)
   wired into `src/hooks/useCheckout.ts` init.
   - Command: `npx jest --roots tests/unit` → **528 suites / 6257 tests passed**.
   - `npx eslint` on the three touched files → clean.
   - Commit: `afcaf499 fix: validate the stored order type against the current store at checkout init`

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A stored order type belonging to the current tenant is kept | `checkout-order-type.test.ts: keeps the stored order type…` | unit | PASS |
| 2 | Nothing stored → first enabled order type | `…falls back to the first enabled order type…` | unit | PASS |
| 3 | Another store's stale ID → replaced with first enabled | `…replaces another store's stale order type…` | unit | PASS |
| 4 | Tenant with no enabled order types → null (stale ID also cleared) | `…returns null when the tenant has no enabled order types` | unit | PASS |

## Coverage and known gaps

- The resolver is fully covered (4/4 branches). The wiring inside
  `useCheckout` is exercised indirectly by the existing 528-suite gate.
- Deliberate scope cut: the global `restaurant_order_type` key itself was NOT
  tenant-scoped (unlike the cart key) to keep the diff minimal; the checkout
  gate makes the stale value harmless. Tenant-scoping the key is a possible
  follow-up.
- Live verification of the fix on production requires a deploy; the bug's
  mechanism (not the fix) was verified live via planted localStorage.
