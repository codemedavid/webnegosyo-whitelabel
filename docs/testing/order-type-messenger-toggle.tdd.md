# TDD Evidence — Per-Order-Type Messenger Toggle

**Source plan:** none. User journeys were derived during this TDD run from the request:
_"I want to be able to add/remove messenger on specific order types and on/off it. If it's turned off it should Complete Order instead on the button on the checkout."_

**Branch:** `feat/unified-modifier-groups`
**Checkpoints:** `0f88ed6` (RED) → `20a4549` (GREEN)

## User journeys

1. As a merchant, I want to turn Messenger off for a specific order type (e.g. Dine-In served at the table) while keeping it on for others (e.g. Delivery), so that in-store customers are never bounced to Facebook.
2. As a customer selecting an order type with Messenger turned off, I want the checkout button to read "Complete Order" instead of "Send Order via Messenger", so the flow matches what actually happens.
3. As an existing merchant who has never touched this setting, I want checkout to behave exactly as before, so nothing regresses.

## Task report

### 1. Pure availability + label rules (`src/lib/messenger-availability.ts`)

New module owning every decision: is Messenger on for this order type, should we auto-redirect, and what does each button say. Both flags default to *enabled* so un-backfilled rows and existing tenants keep current behavior.

- Validation command: `npx jest tests/unit/messenger-order-type-toggle.test.tsx`
- RED: `Cannot find module '../../src/lib/messenger-availability'` — compile-time RED, the intended missing implementation.
- GREEN: `Tests: 14 passed, 14 total`

Guaranteed: `messenger_enabled` is off only when explicitly `false`; auto-redirect requires *both* the tenant switch and the order type; the CTA resolves to `Proceed to Payment` / `Send Order via Messenger` / `Complete Order` correctly in all four input combinations.

### 2. Persistence + admin control

`messenger_enabled boolean not null default true` added to `order_types` (`supabase/migrations/20260725120000_order_type_messenger_toggle.sql`), the `OrderType` interface, the Zod schema, both server-action input types, and the reorder action's preserve list. Admin toggle ("Send via Messenger") added to the order-type detail form.

All read paths use `select('*')`, so the new column reaches the customer client with no query change.

- Validation command: `npx tsc --noEmit -p tsconfig.json`
- Result: no errors in `src/` (pre-existing errors in unrelated `tests/` files remain).

### 3. Checkout behavior (`src/hooks/useCheckout.ts`)

When the selected order type has Messenger off:
- no Messenger URL is built (`messengerUrl` stays empty),
- the proactive `/api/messenger/send-order-public` webhook send is skipped,
- the auto-redirect countdown never starts.

`messengerEnabled` is exposed on `UseCheckoutReturn` and consumed by the checkout designs.

### 4. Customer-facing copy

`CheckoutCTA` (modern/wizard/minimal/express), the Classic design's heading + CTA + "no payment methods" notice, the payment-details step's button and "Next Step" copy, and the confirmation screen's Messenger card all branch on `messengerEnabled`. With Messenger off the confirmation shows "Your order has been sent to \<store\>." instead of copy-and-paste-to-Messenger instructions.

- Validation command: `npx eslint src/lib/messenger-availability.ts src/hooks/useCheckout.ts src/components/customer/checkout-templates/ src/components/admin/order-type-detail.tsx src/app/actions/order-types.ts`
- Result: clean.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | A missing order type defaults to Messenger enabled | `messenger-order-type-toggle.test.tsx:defaults to enabled when the order type is missing` | unit | PASS |
| 2 | An un-backfilled `messenger_enabled` column defaults to enabled | `…:defaults to enabled when the column has not been backfilled yet` | unit | PASS |
| 3 | Messenger is off only on an explicit `false` | `…:is disabled only when the order type explicitly turns Messenger off` | unit | PASS |
| 4 | Auto-redirect fires when tenant + order type both allow it | `…:redirects when both the tenant and the order type allow Messenger` | unit | PASS |
| 5 | An order type with Messenger off suppresses the redirect | `…:does not redirect when the order type turns Messenger off` | unit | PASS |
| 6 | The tenant-level redirect switch still wins independently | `…:still honours the tenant-level redirect switch` | unit | PASS |
| 7 | Unconfigured tenant + order type still redirect (no regression) | `…:defaults to redirecting when neither side has been configured` | unit | PASS |
| 8 | Payment methods route to "Proceed to Payment" regardless of Messenger | `…:sends the customer to payment selection when payment methods exist` | unit | PASS |
| 9 | No payment methods + Messenger on → "Send Order via Messenger" | `…:offers Messenger when it is enabled for the order type` | unit | PASS |
| 10 | No payment methods + Messenger off → "Complete Order" | `…:completes the order in place when Messenger is off for the order type` | unit | PASS |
| 11 | Payment-details submit reads "Order Now" when Messenger is on | `…:keeps the Messenger wording on the payment-details step when Messenger is on` | unit | PASS |
| 12 | Payment-details submit reads "Complete Order" when Messenger is off | `…:reads "Complete Order" when Messenger is off for the order type` | unit | PASS |
| 13 | `CheckoutCTA` renders the Messenger CTA when Messenger is on | `…:renders the Messenger CTA when Messenger is enabled and no payment methods exist` | component | PASS |
| 14 | `CheckoutCTA` renders "Complete Order" and no Messenger wording when off | `…:renders "Complete Order" when Messenger is disabled for the selected order type` | component | PASS |

## Coverage

```
npx jest tests/unit/messenger-order-type-toggle.test.tsx --coverage \
  --collectCoverageFrom='src/lib/messenger-availability.ts'

File                       | % Stmts | % Branch | % Funcs | % Lines
 messenger-availability.ts |     100 |      100 |     100 |     100
```

Full suite: `npx jest` → `Tests: 12 failed, 2142 passed, 2154 total`.

## Known gaps

- **4 pre-existing failing suites, none related to this change:** `webnegosyo-app/lib/printer-native-load.test.ts` and `webnegosyo-app/lib/order-item-images.test.ts` (React Native / mock-hoisting), plus two untracked WIP files (`tests/unit/checkout-cart-empty-guard.test.ts`, `tests/unit/mobile-overrides.test.ts`) that import exports which do not exist yet. None import any module touched here.
- **The migration is not applied.** `supabase/migrations/20260725120000_order_type_messenger_toggle.sql` must be run before the admin toggle can persist; until then `messenger_enabled` is absent and every order type reads as enabled (the intended safe default).
- **No E2E coverage** of the full "toggle off in admin → customer sees Complete Order" round trip; the seam is covered at the unit + component level only.
- **Mobile apps not updated.** `mobile/` uses its own checkout; it still assumes Messenger is available for every order type.
