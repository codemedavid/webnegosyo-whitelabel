# TDD Evidence — Per-order-type "Pay after billing"

**Source plan**: none — journeys derived during this TDD run from the request:
"add an order-type option for after-billing payment; when on, checkout lets the
customer choose a payment method and places the order directly — the payment
modal must not pop up at all."

## User journeys

1. As a merchant, I can turn on "Pay after billing" per order type (e.g. Dine In),
   so my customers settle the bill after service.
2. As a customer on an after-billing order type, I pick a payment method and the
   CTA places the order immediately — the payment-details dialog never opens and
   no payment proof is demanded.
3. As a customer on any other order type (including rows saved before the column
   existed), checkout behaves exactly as before.

## Task report

| Task | Summary | Validation | Result |
|---|---|---|---|
| RED | Tests written first; helper suite failed on missing module `src/lib/after-billing-payment`; all 4 admin tests failed (no switch, payload omitted key) | `npx jest tests/unit/after-billing-payment.test.ts tests/unit/after-billing-admin.test.tsx` → "Test Suites: 2 failed, Tests: 4 failed" | RED (commit `13db145`) |
| GREEN | New pure lib + zod schema key + `OrderType` type + `useCheckout` wiring (proceed branch + proof gate) + CTA label + admin Switch + migration | same command → "Test Suites: 2 passed, Tests: 16 passed" | GREEN (commit `3a23d7c`) |
| Regression | Full main-tree unit suite | `npx jest --roots tests/unit` → "5955 passed, 5955 total" (failures elsewhere are all in the stale `.claude/worktrees/merchant-mcp` copy, pre-existing) | PASS |
| Lint | Changed files only | `npx eslint <9 changed files>` → no output | PASS |
| Migration | `20260828120000_order_types_after_billing_payment.sql` applied via Supabase MCP; column probed | `information_schema.columns` → `boolean NOT NULL DEFAULT false` | APPLIED 2026-08-21 |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Flag is off for null/undefined order types and un-backfilled rows; on only when explicitly true | `after-billing-payment.test.ts: isAfterBillingPaymentEnabled` | unit | PASS |
| 2 | With no configured methods, checkout submits directly (unchanged) | `resolvePaymentSubmitPlan` | unit | PASS |
| 3 | A method must still be chosen first, even for after-billing | `resolvePaymentSubmitPlan` | unit | PASS |
| 4 | Normal order types still open the payment-details step | `resolvePaymentSubmitPlan` | unit | PASS |
| 5 | After-billing skips the payment-details step and submits the order | `resolvePaymentSubmitPlan` | unit | PASS |
| 6 | CTA reads "Send Order via Messenger"/"Complete Order" (not "Proceed to Payment") under after-billing; callers not passing the flag are unchanged | `resolveCheckoutCtaLabel with after-billing` | unit | PASS |
| 7 | `orderTypeSchema` carries `after_billing_payment_enabled` through (zod strips unknown keys) and stays optional for legacy rows | `orderTypeSchema — after_billing_payment_enabled` | unit | PASS |
| 8 | Admin switch reflects the saved value, defaults off for legacy rows, and every save carries the current value (unrelated saves can't revert it) | `after-billing-admin.test.tsx` | component | PASS |

## Coverage and known gaps

- `src/lib/after-billing-payment.ts`: 100% stmts/branch/funcs/lines.
- `useCheckout` wiring (`resolvePaymentSubmitPlan` call in `handleProceedToPayment`,
  proof-gate bypass in `handleCheckout`) is not exercised by a rendered-hook test —
  no test in the repo renders the real `useCheckout` (all mock it). The decision
  logic itself is fully covered; the wiring is a 5-line reviewable change.
- Proof-gate bypass is asserted only indirectly (plan says the details step —
  where proof is entered — never opens). Without the bypass, a proof-required
  method would hard-block an after-billing checkout.
- Mobile app checkout (`mobile/`) is intentionally out of scope — feature was
  requested for the web checkout.
- No E2E test; the flow is behind per-tenant admin configuration.

## Merge evidence

RED `13db145` → GREEN `3a23d7c`. If squashed, this file preserves the cycle.
