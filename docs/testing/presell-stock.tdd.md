# TDD Evidence — Presell stock (per-date allocations)

**Source plan:** inline `/ecc:plan` output (conversational mode, no `*.plan.md`); journeys
below were derived during that plan and confirmed with "proceed". Branch: `presell-stock`.

## User journeys

1. As a merchant, I toggle presell on a menu item and allocate a stock quantity per
   calendar date, so I can sell a limited batch for specific pickup days.
2. As a customer, when I add a presell item I must choose a date from a calendar that shows
   remaining stock per date, and I cannot add more than that date's remainder.
3. As a customer, the date I chose flows into the existing advance-order schedule at
   checkout; I only pick a time.
4. As the platform, two customers racing for the last unit cannot both succeed; a cancelled
   pre-order gives its stock back.
5. As a merchant on the mobile app, pre-sold orders are marked on the Scheduled tab.

## Checkpoint commits (all reachable from `HEAD` on `presell-stock`)

| Phase | RED | GREEN | Scope |
|---|---|---|---|
| 1 | — | `04f632bf` | migration `20260830120000_presell_stock.sql` + `database.ts` types (APPLIED to live DB via MCP, probed with BEGIN/ROLLBACK: claim 3/5 then `already_applied`) |
| 2 | `dd4bd816` | `1799abfe` | `presell/availability.ts`, `checkout-guard.ts`, `claim.ts` |
| 3 | — | `52580eb0` | admin panel + server actions + tenant/menu flags + regenerated Supabase types (schema/typecheck-driven; covered by Phase 2 guard tests) |
| 4 | `324d63ad` | `b303ab22` | date picker, availability API, cart caps, one-date-per-cart |
| 5 | `023870cc` | `2bb3bbd5` | checkout schedule lock, atomic order claim, Convex v25 |
| 6 | `036761fa` | `665c178a` | merchant app badges |
| refactor | — | `ace276f4` | Jest ignores `.worktrees/`; drawer tests under QueryClientProvider; edit-call arity |

## Task report

### Phase 2 — pure availability math, server guard, claim wrapper
- Command: `npm test -- --testPathPatterns="presell"`
- RED: 3 suites failed (modules absent). GREEN: `Tests: 37 passed, 37 total`.
- Guarantees: no allocation = zero remaining; guard fails CLOSED once the tenant flag is
  on and no-opinion when off/unreadable; `PRESELL_SHORTFALL:<item>:<date>` parsed from
  wrapped messages; rpc called with `{p_tenant_id, p_order_id, p_direction, p_lines}`.

### Phase 3 — admin allocations + flags
- Commands: `npx tsc --noEmit` (0 errors under `src/`), `npm test -- --testPathPatterns="presell"`
  (37/37), `npx eslint <touched files>` (clean).
- Types regenerated with `mcp__supabase__generate_typescript_types` (not hand-patched).

### Phase 4 — customer date picker + cart caps
- Command: `npm test -- --testPathPatterns="presell-(cart|month-grid|availability-route|date-picker)"`
- RED: `4 failed suites, 15 failed / 2 passed` (the two passes lock unchanged behaviour of
  `generateCartItemId` and `makeCartItem` for ordinary dishes).
- GREEN: `npm test -- --testPathPatterns="presell"` → `Test Suites: 7 passed, Tests: 75 passed`.
- Also closes the pre-existing missing quantity re-check in `handleAddToCart`.

### Phase 5 — checkout integration + Convex v25
- Command: `npm test -- --testPathPatterns="presell-(checkout-schedule|convex-args|order-claim)"`
- RED: 3 suites failed (Cannot find module). GREEN: `Tests: 22 passed, 22 total`.
- Wider check: `npm test -- --testPathPatterns="presell|advance-order|checkout|orders-service|order-create"`
  → every suite in this tree PASS (the 13 FAIL lines were `.worktrees/superadmin-mcp-supabase/*` copies).
- `npm run convex:prebundle` rebuilt `src/lib/convex-push-bundle.json`; `CURRENT_SCHEMA_VERSION = 25`.

### Phase 6 — merchant app
- Command: `cd webnegosyo-app && npx jest lib/presell-orders.test.ts components/OrderCard.test.tsx`
- RED: TS2307 `./presell-orders` missing; `Pre-order ·` chip test `1 failed / 4 passed`.
- GREEN (with `lib/scheduled-orders*.test.ts`): `Test Suites: 4 passed, Tests: 44 passed`.
- `npx tsc --noEmit -p .` and eslint on touched app files: clean.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | No allocation on a date = zero remaining; past dates dropped | `tests/unit/presell-availability.test.ts` | unit | PASS |
| 2 | Guard refuses a presell item without a date; fails closed when stock unreadable and flag on | `tests/unit/presell-checkout-guard.test.ts` | unit | PASS |
| 3 | Shortfall marker parsed; rpc payload shape; empty lines skip rpc | `tests/unit/presell-claim.test.ts` | unit | PASS |
| 4 | presell_date keys the cart line; one date per cart; refresh shrinks/removes sold-out lines | `tests/unit/presell-cart.test.ts` | unit | PASS |
| 5 | Month grid Sunday-first, leap years, labels without locale APIs | `tests/unit/presell-month-grid.test.ts` | unit | PASS |
| 6 | `GET /api/presell/availability` 400 without ids, no-store, empty-on-error; server read drops past dates and throws on error | `tests/unit/presell-availability-route.test.ts` | integration | PASS |
| 7 | Picker shows "N left", disables sold-out/past/unallocated, reports YYYY-MM-DD, month nav | `tests/unit/presell-date-picker.test.tsx` | component | PASS |
| 8 | Presell forces scheduling, hides ASAP, stretches horizon; date list collapses; claim round-trips through customer_data | `tests/unit/presell-checkout-schedule.test.ts` | unit | PASS |
| 9 | `items[].presellDate` only sent to Convex ≥ v25 | `tests/unit/presell-convex-args.test.ts` | unit | PASS |
| 10 | Claim runs guard then atomic claim; names the losing line on shortfall; release is best-effort | `tests/unit/presell-order-claim.test.ts` | unit | PASS |
| 11 | App detects pre-sold orders (customer_data first, items fallback); per-day counts fold missed days into today | `webnegosyo-app/lib/presell-orders.test.ts` | unit | PASS |
| 12 | OrderCard shows `Pre-order · Sat, Jun 20` only on pre-sold orders | `webnegosyo-app/components/OrderCard.test.tsx` | component | PASS |

## Coverage

`npx jest --coverage --collectCoverageFrom='src/lib/presell/**/*.ts' ... --testPathPatterns="presell"`:

| File | Stmts | Branch |
|---|---|---|
| All presell files | 97.77% | 93.65% |
| `lib/presell/*` | 97.27% | 92.12% |
| `presell-date-picker.tsx` | 100% | 100% |
| `calendar-client.ts` | 0% | 0% (browser fetch glue; exercised only through hooks) |

Full web suite after cleanup: see "Final suite" below. Web suite before the cleanup commit:
`Test Suites: 2 failed, 559 passed; Tests: 8 failed, 6591 passed` — the two failures were
`cart-drawer-edit` / `cart-drawer-close-affordance` (no QueryClientProvider in the test
harness after the drawer began reading presell caps), fixed in `ace276f4`.
App suite: `components/pos/DiscountSheet.test.tsx` failed once in the full run (12.6 s) and
passed on rerun (`22 passed`); unrelated to presell files.

## Known gaps / intentional omissions

- **Un-cancelling** a presell order does not re-reserve stock (idempotency key is per
  claim id + direction). Documented in `orders-service.ts`.
- `useCart.addItem` conflict result and `refreshCartItems` reconciliation are covered via
  pure helpers, not a `CartProvider` render test.
- Convex v25 is bundled but **not deployed** to any tenant; below v25 the web omits
  `presellDate` and the app reads `customerData.presell_date`.
- Merchant allocating a date the store's weekly hours mark closed yields no time slots
  at checkout (customer cannot submit) — the picker does not cross-check operating hours.
- No E2E/browser run; unproven end-to-end in a real tenant.
- Customer mobile app (`mobile/`) and per-branch allocations are out of v1 scope.

## Hazard for reviewers

Commit `2bb3bbd5` (Phase 5 GREEN) also carried **another session's uncommitted
payment-proof hunks** in `src/hooks/useCheckout.ts`,
`checkout-templates/checkout-primitives.tsx` and `classic-checkout.tsx`, because those
files were already dirty when this work started. Their companion files
(`checkout-shared.tsx`, `payment-proof-field.tsx`, `after-billing-payment.ts`,
`messenger-availability.ts`, `tests/unit/after-billing-payment.test.ts`,
`tests/unit/payment-proof-field.test.tsx`) remain uncommitted in the working tree and
their tests pass (18/18). History was deliberately not rewritten.

## Final suite

`npx jest` (web, after `ace276f4`): `Test Suites: 1 skipped, 561 passed, 561 of 562 total` ·
`Tests: 8 skipped, 6599 passed, 6607 total` — 0 failures.
