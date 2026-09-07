# Orders lost to the Messenger redirect — TDD evidence

**Branch:** `data-layer-overhaul` · **Date:** 2026-09-07
**Checkpoints:** `e724d05c` (RED) → `611a3096` (GREEN)

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from the reported
symptom: *"sometimes it goes to the messenger but the order doesn't get saved
to the database … maybe because it redirects immediately to the messenger."*

## User journeys

1. As a customer, when I place an order and Messenger opens, the order is
   already saved, so the merchant receives it through the admin queue and not
   only as a chat message.
2. As a customer, if the save fails transiently, it is retried — without ever
   creating a second live order.
3. As a customer, if the order truly could not be confirmed, I am told, and I
   am told the one action that still delivers it.
4. As a merchant, I never lose an order because the customer's tab was frozen
   by the Messenger deep link.

## Root cause

`src/hooks/useCheckout.ts` PHASE 3 rendered the confirmation screen, cleared
the cart and toasted success **before** PHASE 4 called `createOrderAction`.
The redirect ran on an independent 3-second `setInterval`, so:

- On a phone, `window.open('https://m.me/…')` hands control to the Messenger
  app. The checkout tab is backgrounded and frozen, and the in-flight Server
  Action `fetch` is abandoned mid-request. No row is written.
- Any failure — network loss, a server refusal, an exception — produced a lone
  `console.warn`, invisible to customer, merchant and logs anyone reads.
- Nothing retried, even though `client_order_id` exists for that purpose.

## Task report

### 1. Gate the redirect on the save

Added `awaitSaveBeforeRedirect` and wired the countdown effect to await the
in-flight save (tracked in `orderSavePromiseRef`) before `window.open`. An 8s
ceiling means a hung save delays the redirect but never blocks it; a failed
save still opens Messenger, because that message is the merchant's remaining
copy of the order.

- RED: `Cannot find module '@/lib/checkout/messenger-redirect-gate'`
- GREEN: `npx jest --config jest.config.cjs tests/unit/checkout/` → 26 passed

### 2. Retry the save, but only where retrying is safe

`saveOrderDurably` retries 3× with 400ms/1200ms backoff. Gated by
`isOrderSaveRetrySafe`, which **fails closed**: a security/correctness audit of
the three order backends found only the shared platform Supabase path dedupes
on `client_order_id` (partial unique index `orders_tenant_client_order_id_uq`).
`createOrderConvex` never forwards the id despite the Convex mutation
supporting it, and a tenant's own Supabase project has no idempotency at all —
on both, a retry would create a second live order and re-burn vouchers,
re-deplete stock and re-notify. Those tenants keep exactly one attempt.

### 3. Say the failure out loud

A persistent `role="alert"` notice on the confirmation screen plus a 12s toast,
both naming the Messenger message as the recovery. Replaces the `console.warn`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | The redirect waits for the save to settle before opening Messenger | `tests/unit/checkout/messenger-redirect-wiring.test.ts` | wiring (source) | PASS |
| 2 | A hung save gives up at a ceiling instead of stranding the customer | `messenger-redirect-gate.test.ts:gives up at the ceiling` | unit | PASS |
| 3 | A rejected save is reported, never thrown into the redirect path | `messenger-redirect-gate.test.ts:reports a failed save` | unit | PASS |
| 4 | A transient refusal is retried and can still succeed | `durable-order-save.test.ts:retries a refused save` | unit | PASS |
| 5 | An aborted (throwing) save is retried, not only `success:false` | `durable-order-save.test.ts:retries a save that throws` | unit | PASS |
| 6 | Retries are bounded and back off, so checkout never hangs | `durable-order-save.test.ts:backs off between attempts` | unit | PASS |
| 7 | Convex and tenant-Supabase tenants are never retried (no dedupe) | `order-save-retry-safety.test.ts` | unit | PASS |
| 8 | A dropped column projection cannot silently unlock retries | `order-save-retry-safety.test.ts:backend fields were never projected` | unit | PASS |
| 9 | A failed save shows a persistent notice naming Messenger | `order-save-failure-notice.test.tsx` | component | PASS |

## Coverage

`npx jest --config jest.config.cjs tests/unit/checkout/ --coverage
--collectCoverageFrom='src/lib/checkout/**/*.ts'`

```
All files | % Stmts 100 | % Branch 81.57 | % Funcs 80 | % Lines 100
```

Full suite: `609 passed, 1 failed` — the failure is
`tests/unit/lib/leads/leads-analytics.test.ts` (5s timeouts), pre-existing and
unrelated; it imports `@/lib/leads/leads-analytics`, which this change does not
touch.

## Known gaps / follow-ups

These were found by the audit and are **not** fixed here — each needs work
beyond this bug's scope:

1. **Convex idempotency (HIGH).** `createOrderConvex` (`src/lib/orders-service.ts`)
   never forwards `clientOrderId`, though `convex-template/convex/orders.ts`
   accepts it and dedupes on `by_client_order_id`. Forwarding it blind is unsafe:
   tenant Convex deployments lag the template, and an unknown arg is rejected by
   Convex's validator, which would fail *every* order for lagging tenants. Needs
   a schema-version gate plus a deploy.
2. **Tenant-Supabase idempotency (HIGH).** `src/lib/tenant-supabase-orders.ts`
   has no `client_order_id` column or index. Needs a migration.
3. **Refusals after the optimistic screen (HIGH).** Order-minimum re-check,
   Loyverse stock, advance-order slot re-validation, distance-delivery radius and
   price-verification can all still refuse *after* "Order Placed!". They now
   produce a visible notice rather than silence, but no preflight hoists them
   ahead of the screen the way presell and producible-quantity are.
4. **`order_token_hash` likely never written on the platform backend (MEDIUM).**
   `createOrderToken` UPDATEs `orders` with the anon client, and no anon UPDATE
   RLS policy exists — so `orderToken` is probably always undefined and the
   proactive `send-order-public` path may never fire. Needs a live probe.

## Merge evidence

RED `e724d05c` → GREEN `611a3096`. If squashed, this file is the record.
