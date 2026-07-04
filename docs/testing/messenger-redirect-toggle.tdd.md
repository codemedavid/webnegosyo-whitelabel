# TDD Evidence — Messenger Redirect Toggle

**Task:** Allow turning the checkout → Messenger redirect on/off per tenant.

**Source plan:** No `*.plan.md` supplied; journeys derived during this TDD run.

## User journeys

1. As a **merchant admin**, I want to turn the automatic "open Messenger after checkout"
   redirect off, so customers who I contact another way aren't bounced to Messenger.
2. As a **merchant admin**, I want to turn it back on, restoring the auto-redirect.
3. As a **customer** of a tenant with the redirect **off**, when I place an order I stay on
   the confirmation screen (message auto-expanded to send manually) and am **not** auto-opened
   into Messenger.
4. As a **customer** of a tenant with the redirect **on** (or an existing tenant with no
   preference set), behavior is unchanged — the 3-second countdown opens Messenger.

## Behavior guaranteed by tests

The decision is isolated in a pure function `isMessengerRedirectEnabled(tenant)` so it is
unit-testable without rendering the checkout. Backward compatibility (undefined/null ⇒ ON) is
the key invariant, since existing tenant rows predate the column.

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Explicit `true` ⇒ redirect enabled | `cart-utils.test.ts › isMessengerRedirectEnabled › returns true when the flag is explicitly true` | unit | PASS |
| 2 | Explicit `false` ⇒ redirect disabled | `…› returns false when the flag is explicitly false` | unit | PASS |
| 3 | `undefined` ⇒ ON (backward compatible) | `…› defaults to true when the flag is undefined` | unit | PASS |
| 4 | `null` ⇒ ON | `…› defaults to true when the flag is null` | unit | PASS |
| 5 | `null`/`undefined` tenant ⇒ ON (no crash) | `…› defaults to true when the tenant is null or undefined` | unit | PASS |

## RED → GREEN evidence

- **RED:** `npx jest tests/unit/lib/cart-utils.test.ts -t "isMessengerRedirectEnabled"`
  → `TypeError: isMessengerRedirectEnabled is not a function` (5 failed) — failure caused by the
  missing implementation, i.e. the intended business-logic gap.
- **GREEN:** after adding `isMessengerRedirectEnabled` to `src/lib/cart-utils.ts` →
  `Tests: 45 passed, 45 total` for the full `cart-utils.test.ts` suite.
- **Lint:** `eslint` clean on all touched files (the transient `exhaustive-deps` warning was
  removed in refactor by deriving `messengerRedirectEnabled` before the effect).

## Implementation surface

| File | Change |
|------|--------|
| `src/lib/cart-utils.ts` | New pure helper `isMessengerRedirectEnabled` |
| `src/hooks/useCheckout.ts` | Countdown effect gated on `messengerRedirectEnabled`; when off, expand message, no `window.open` |
| `src/types/database.ts` | `messenger_redirect_enabled?: boolean` on `Tenant` |
| `src/types/supabase.ts` | Column added to Row/Insert/Update |
| `supabase/migrations/20260704060000_messenger_redirect_enabled.sql` | `boolean NOT NULL DEFAULT true` |
| `src/actions/tenants.ts` | `updateTenantMessengerRedirectEnabledAction` (admin-guarded) |
| `src/components/admin/messenger-mode-card.tsx` | Switch: "Auto-open Messenger after checkout" |
| `src/app/[tenant]/admin/settings/page.tsx` | Passes `currentRedirectEnabled` |

## Coverage & known gaps

- The decision logic (`isMessengerRedirectEnabled`) has full branch coverage.
- **Not unit-tested (intentional):** the `useCheckout` effect wiring and the admin card/server
  action — these are thin glue over the covered helper and Supabase; behavior verified via lint +
  typecheck. A follow-up React Testing Library test could assert `window.open` is not called when
  the flag is off.
- The migration must be applied to the DB before the toggle persists.
- Order delivery to the merchant (DB insert + proactive webhook send) is **not** affected by this
  toggle — it only suppresses the customer-facing auto-redirect.
