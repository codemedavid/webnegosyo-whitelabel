# TDD Evidence — Customer Management, Phase 3 (the capture gap)

**Source plan**: inline plan agreed in-session (no `*.plan.md` artifact).
**Prior phase**: [`customer-management-phase-1.tdd.md`](./customer-management-phase-1.tdd.md).
**Scope**: making an order created by the merchant app build a customer profile.
UI (Phase 2) and the POS customer picker (Phase 4) remain outstanding.

## Why this phase came before the UI

Phase 1's evidence report recorded the defect this phase fixes:

> App-created orders still do not build customer profiles. Every capture call
> site (`upsertCustomerFromOrder`, `captureExternalOrderBestEffort`) lives in
> `src/` — the Next.js app. The merchant app inserts orders directly via
> `webnegosyo-app/lib/backends/supabase-adapter.ts:339` or Convex, touching none
> of them.

So a cashier could type a guest's number in perfectly and the Regulars list would
never hear about it. **Every POS sale was invisible to the customer system.**
Phase 4 (attaching a customer at the register) had to wait: attaching a guest to
a sale that never reaches the profile system produces a link whose statistics
never move, which reads to a merchant as a bug rather than a missing feature.

## User journeys

1. As a merchant, I want a sale I ring up at the counter to count towards the
   guest's history, so my Regulars list reflects the shop I actually run.
2. As a merchant, I want an order I accept by scanning a customer's QR code to
   count too, so the channel a guest used does not decide whether they exist.
3. As a cashier, I never want a bookkeeping problem to fail a sale that has
   already been paid for.
4. As the platform, I want one store's register to be unable to write into
   another store's guest list.

## Task report

### Task 1 — Validating the capture request

Added `src/lib/customer-capture-request.ts`. Turns the untrusted body into a
capture instruction under two principles: a malformed *detail* degrades rather
than rejecting the capture (a bad total, a garbage line, a missing name — losing
the guest is worse than thinning the data), while a malformed *identity of the
order* is refused (getting that wrong corrupts the ledger rather than thinning
it).

- **RED**: `npx jest tests/unit/customer-capture-request.test.ts` →
  `Cannot find module '../../src/lib/customer-capture-request'` — compile-time
  RED, the test newly referenced the missing implementation.
- **RED (runtime)**: after adding the `customerData` narrowing test →
  `expect(received).toBeNull() / Received: "phone: 0917"`.
- **GREEN**: same command → `Tests: 25 passed, 25 total`.

### Task 2 — Routing a sale to the right capture path

Added `src/lib/customer-capture-service.ts`. Dispatch only; it reimplements
neither identity resolution nor the profile aggregate. A `platform` order links
through `orders.customer_id` and is recomputed from its real order rows; a
`convex` or `tenant_supabase` order copies its facts into the
`customer_external_orders` ledger, which the same recompute then reads.

- **RED**: `npx jest tests/unit/customer-capture-service.test.ts` →
  `Cannot find module '../../src/lib/customer-capture-service'`.
- **GREEN**: → `Tests: 10 passed, 10 total`.

### Task 3 — The route

Added `src/app/api/customers/capture-order/route.ts` — authorization, parse,
dispatch, nothing else. Authenticated with the caller's own Supabase access
token and authorized against their `app_users` row, mirroring
`/api/inventory/order-stock`.

Not directly unit-tested: it is auth plus two already-tested calls, and the
project's convention (`inventory-order-stock-*.test.ts`) is to test the service
beneath a route rather than the route itself. Covered by `tsc` and lint.

### Task 4 — The register's side

Added `webnegosyo-app/lib/customers/capture.ts` and wired it into both
order-creating screens: `app/(main)/pos-tender.tsx` (counter sales) and
`app/(main)/scan.tsx` (QR handoff). Contract borrowed from
`lib/pos-stock-notify.ts` — it runs after the money is in the drawer, so it
never throws.

- **RED**: `npx jest lib/customers/capture.test.ts` →
  `TS2307: Cannot find module './capture'`.
- **GREEN**: `npx jest lib/customers` → `Tests: 52 passed, 52 total`.
- **No regression**: merchant app `npx jest` → `133 passed, 2192 tests`;
  web `npx jest tests/unit` → `393 passed, 4899 tests`.
- **Typecheck**: `npx tsc --noEmit` clean in both packages.
- **Lint**: `npm run lint` reports nothing on any file touched here. One warning
  this work introduced (`useCallback` missing `convexUrl` / `orderBackend`) was
  fixed rather than suppressed.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A capture with no tenant, no order id, or an unknown backend is refused | `customer-capture-request.test.ts:rejects a body with no tenant` (+ order id, backend) | unit | PASS |
| 2 | `platform`, `convex`, `tenant_supabase` are each accepted | `:accepts the %s backend` | unit | PASS |
| 3 | A non-object body is refused rather than crashing the route | `:rejects a body that is not an object at all` | unit | PASS |
| 4 | A numeric-string total is coerced, as JSON bodies deliver them | `:coerces a numeric-string total` | unit | PASS |
| 5 | An unreadable or negative total becomes zero rather than losing the guest | `:falls back to a zero total for %s`, `:clamps a negative total to zero` | unit | PASS |
| 6 | ISO timestamps pass through; Convex epoch milliseconds are accepted | `:passes an ISO timestamp through`, `:accepts epoch milliseconds` | unit | PASS |
| 7 | A missing timestamp yields null so the **server** stamps it — never a till's clock | `:returns a null timestamp when absent` | unit | PASS |
| 8 | One malformed line item is dropped, not the whole capture | `:drops malformed lines instead of rejecting the whole capture` | unit | PASS |
| 9 | A non-object `customerData` is nulled; the resolver reads it structurally | `:nulls a customerData that is not an object` | unit | PASS |
| 10 | **A caller can never name a customer** — identity is resolved server-side, so a register cannot attach its sale to another tenant's guest | `:never carries a client-supplied customer id` | unit | PASS |
| 11 | A platform order links through the order row itself | `customer-capture-service.test.ts:links a platform order to its customer through the order row itself` | unit | PASS |
| 12 | A platform capture is not told the caller's own totals — the real order row is the source | `:does not pass the caller its own totals for a platform order` | unit | PASS |
| 13 | Convex and tenant-Supabase orders route to the external ledger | `:copies a %s order into the external ledger` | unit | PASS |
| 14 | A capture failure never propagates — the sale is already paid for | `:swallows a capture failure rather than failing the sale` | unit | PASS |
| 15 | A failure is logged with tenant and order id, so the idempotent capture can be replayed | `:logs a failure with enough context to replay it` | unit | PASS |
| 16 | An order identifying nobody yields null, which is a normal outcome and not an error | `:returns null for an order that identifies nobody` | unit | PASS |
| 17 | The app's `supabase` backend is translated to the platform's `tenant_supabase`, or the capture would be refused as unknown | `capture.test.ts:translates the %s backend to %s` | unit | PASS |
| 18 | An anonymous walk-in makes no network request at all | `:makes no request at all for an anonymous walk-in` | unit | PASS |
| 19 | A guest identified only by a phone inside `customerData` is still captured | `:sends an order identified only by a phone in the customer blob` | unit | PASS |
| 20 | The call carries the caller's own bearer token | `:posts the sale to the capture route with the caller's token` | unit | PASS |
| 21 | No session means no request, rather than an unauthenticated one | `:makes no request when there is no session` | unit | PASS |
| 22 | Neither a failed request nor a failed session lookup throws at the counter | `:does not throw when the request fails`, `:does not throw when the session lookup itself fails` | unit | PASS |

## Coverage and known gaps

No coverage threshold is configured in either package, and no coverage command
was run, so no percentage is claimed. Both new pure modules are exercised across
every exported function and every error branch (35 web tests, 17 app tests).

Deliberate gaps and outstanding risks:

- **Not verified against a live tenant.** Every result above is from unit tests,
  `tsc`, and lint. The end-to-end path — a real sale on a real register producing
  a real profile row — has not been exercised, and the app change needs a build
  to reach a device.
- **The route itself is untested.** Its authorization is a copy of the sibling
  stock route's; the logic below it is tested. A route-level test would be worth
  adding when either diverges.
- **Historic POS sales stay missing.** This fixes the going-forward path only.
  Every counter sale already rung up remains absent from the Regulars list; the
  existing backfill (`src/lib/customers-backfill.ts`) is the tool for that and
  was not run.
- **RLS is still not a permission boundary.** Unchanged from Phase 1:
  `customers_write_admin` checks `role = 'admin'` and every staff row in this
  codebase is `role='admin'`, so any staff member can read and write the full
  tenant PII list. A product decision, not a code fix.
- **Phase 2 (UI) and Phase 4 (POS picker) remain unbuilt.** Phase 4's blocker is
  now cleared.

## Merge evidence

Checkpoint commits on `feat/android-sms-followups`:

- `0e28234` — `test: add reproducer for app order customer capture request parsing` (RED)
- `50c6228` — `feat: validate the merchant app's customer capture request` (GREEN 24/24)
- `20a83f4` — `test: add reproducer for app order capture dispatch` (RED)
- `7c81e1b` — `feat: route merchant-app orders into customer capture` (GREEN 35/35)
- `9acb0a4` — `test: add reproducer for register-side customer capture` (RED)
- `51e7458` — `feat: capture the guest behind a register sale` (GREEN 52/52 + both full suites)

No refactor commit: the one design change made under test (narrowing
`customerData` to a record) was driven by a failing test and landed inside the
GREEN commit for that module.
