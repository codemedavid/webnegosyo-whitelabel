# TDD evidence — Payment methods management on the merchant app

**Source plan**: none on disk. Journeys were derived during the `/ecc:plan` run
that preceded this cycle (inline plan, option A: a `payments` tab in the
Products view).

**Branch**: `feat/platform-supabase-order-parity`
**Checkpoints**: `0f0401a` (RED) → `80560b1` (GREEN) → `6322618` (refactor)

## User journeys

1. As a merchant, I want to see every payment method I have set up — including
   the deactivated ones — so I can manage them from my phone.
2. As a merchant, I want to add a payment method with a QR image and pick which
   order types it applies to, so customers are offered it at checkout.
3. As a merchant, I want to edit, deactivate, reorder and delete methods, so my
   checkout stays current.
4. As an owner, I do not want a cashier reaching my payment settings.

## What was built

| File | Action |
|---|---|
| `webnegosyo-app/lib/payment-methods.ts` | CREATE — validation, editor form state, pure reorder, and the Supabase CRUD |
| `webnegosyo-app/app/(main)/payments.tsx` | CREATE — list, toggle, ↑/↓ reorder |
| `webnegosyo-app/app/(main)/payment/[methodId].tsx` | CREATE — add/edit, QR upload, order-type ticks, delete |
| `webnegosyo-app/lib/workspaces.ts` | UPDATE — `payments` joins the Products view |
| `webnegosyo-app/lib/staff-permissions.ts` | UPDATE — `payments → store_setup` |
| `webnegosyo-app/app/(main)/_layout.tsx` | UPDATE — tab + `href: null` editor route |
| `webnegosyo-app/lib/navigation.ts` | UPDATE — `NEW_PAYMENT_METHOD_ID`, `paymentMethodHref` |
| `webnegosyo-app/lib/product-image-upload.ts` | UPDATE — `PAYMENT_QR_FOLDER`, `uploadPaymentQr` |
| `webnegosyo-app/lib/image-picker.ts` | UPDATE — `pickQrImage` (1:1) |

No migration: `payment_methods` and `payment_method_order_types` already exist
(`supabase/migrations/0012_payment_methods.sql`,
`20260617100000_payment_proof.sql`).

## Task report

### 1. Pure module + CRUD

Written test-first as `lib/payment-methods.test.ts`, then implemented.

- **RED** — `npx jest lib/payment-methods.test.ts`:
  `Test suite failed to run … TS2307: Cannot find module './payment-methods'`.
  Compile-time RED: the test newly references the absent module, and the failure
  is that missing implementation, not unrelated setup.
- **GREEN** — same command: `Tests: 40 passed, 40 total` (44 after the
  refactor stage added `getPaymentMethod` coverage).

### 2. Screens, tab registration and permission gating

Written test-first as `lib/payments-screen-mount.test.ts` — source-assertion
guardrails, since Jest here only runs pure-logic roots (`lib/`, `theme/`) and
cannot render a screen.

- **RED** — `npx jest lib/payments-screen-mount.test.ts`:
  `Tests: 19 failed, 1 passed` — no tab in the registry, no permission mapping,
  and `ENOENT … app/(main)/payments.tsx` / `app/(main)/payment/[methodId].tsx`.
  (The one pass was "lets a staff member granted store setup in", which holds
  either way.)
- **GREEN** — `npm test`: `Test Suites: 86 passed, Tests: 1413 passed`.

One assertion was corrected after RED: `not.toMatch(/router\.replace/)` matched
the *comment* explaining why `router.replace` is wrong in the tab tree. It now
strips comments first (`readCode`), preserving the guarantee — no such call —
while allowing the prose. Same precedent as `business-screen-mount.test.ts`.

### 3. Refactor

Three identical demo guards in the editor collapsed to one `blockedByDemo()`
helper, matching the list screen. The guardrail was tightened at the same time:
it now asserts each of `handlePickQr` / `handleSave` / `handleDelete` calls the
guard, rather than counting an `isDemo` substring.

- **GREEN after refactor** — `npm test`: `Test Suites: 86 passed, Tests: 1420
  passed`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Management lists methods of every status — a deactivated method can still be found and switched back on | `lib/payment-methods.test.ts:reads the tenant's methods whatever their status` | unit | PASS |
| 2 | The order-type join is a LEFT join, so a method linked to nothing still appears instead of vanishing | `…:left-joins the order-type links so a method offered nowhere still appears` | unit | PASS |
| 3 | Junction rows are flattened to `order_type_ids`; a method with no links reads as `[]` rather than crashing | `…:flattens the junction rows…`, `…:reads a method with no links…` | unit | PASS |
| 4 | A method saved with no order type is rejected, instead of saving cleanly and appearing nowhere | `…:rejects a method linked to no order type` | unit | PASS |
| 5 | A malformed QR link is rejected; a blank one is simply "no QR" | `…:rejects a QR url that is not a url`, `…:treats a blank QR url as simply not having one` | unit | PASS |
| 6 | The Add form is always a clean slate, so the previously edited method cannot leak into it | `…:returns pristine values when adding rather than editing`, `…:hands back a copy…` | unit | PASS |
| 7 | Reordering renumbers `order_index`, which is what the storefront actually sorts by | `…:renumbers order_index to the new positions` | unit | PASS |
| 8 | Reordering is pure — the caller's list is never mutated, and the ends are no-ops | `…:does not mutate the list it was given`, `…:leaves the order untouched at the ends` | unit | PASS |
| 9 | `order_type_ids` is never written into the `payment_methods` row (no such column — Postgres would reject the whole write) | `…:never writes the order-type links into the payment_methods row` (create + update) | unit | PASS |
| 10 | A new method is placed after the merchant's existing ones; the first starts at 0 | `…:places a new method after the merchant's existing ones`, `…:starts the first method at zero…` | unit | PASS |
| 11 | Order-type links are replaced, not appended, so unticking a channel actually removes it | `…:clears the old links before writing the new ones` | unit | PASS |
| 12 | A failed link clear aborts rather than inserting duplicates on top of it | `…:surfaces a failed clear instead of writing duplicates on top of it` | unit | PASS |
| 13 | Every read and write is scoped by `tenant_id` as well as `id` | `…:scopes the write to the tenant as well as the row`, `…:deletes only within the tenant`, `…:reads one method scoped to the tenant` | unit | PASS |
| 14 | Query errors are surfaced, never swallowed into an empty list that reads as "you have no payment methods" | six `surfaces a … error` cases | unit | PASS |
| 15 | A stale editor link shows "not found" rather than an error | `…:returns null when the method is not this tenant's` | unit | PASS |
| 16 | The Payments tab belongs to Products and has a route file — a registered tab without one breaks the tab bar for every account | `lib/payments-screen-mount.test.ts:belongs to the Products view…`, `…:has a route file…` | guardrail | PASS |
| 17 | Every registered tab is gated by `show()` in `_layout` | `lib/business-screen-mount.test.ts:gates payments behind the active view` | guardrail | PASS |
| 18 | A cashier without `store_setup` cannot reach payment settings; a staff member granted it can | `lib/payments-screen-mount.test.ts:keeps a cashier out…`, `…:lets a staff member granted store setup in` | guardrail | PASS |
| 19 | The permission key stays in parity with the web registry | `tests/unit/staff-permissions-parity.test.ts` (repo root) | unit | PASS |
| 20 | The editor is routable but never a tab | `…:registers the editor as a routable screen that is not itself a tab` | guardrail | PASS |
| 21 | Screens defer to the shared read/rules — no inline `from("payment_methods")`, no re-derived "offered nowhere" test | `…:loads through the shared read…`, `…:names a method that is offered nowhere through the shared rule` | guardrail | PASS |
| 22 | Both screens wait for a tenant before querying | `…:waits for a tenant before loading` (both screens) | guardrail | PASS |
| 23 | A failed read offers a retry instead of an empty list; the list is pull-to-refreshable and escapable | `…:offers a retry…`, `…:lets the merchant pull the list down…`, `…:keeps the workspace switcher…` | guardrail | PASS |
| 24 | Every write path is blocked in the demo session | `…:blocks handlePickQr/handleSave/handleDelete in the demo session` | guardrail | PASS |
| 25 | Creating navigates with `goTo`, never `router.replace` (which crashes the tab tree with "Cannot read property 'stale' of undefined") | `…:navigates with goTo after creating, never router.replace` | guardrail | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/payment-methods.ts' lib/payment-methods.test.ts

File                | % Stmts | % Branch | % Funcs | % Lines
 payment-methods.ts |   94.73 |    75.92 |     100 |     100
```

Above the 80% bar on statements, functions and lines. The uncovered branches are
null-coalescing defaults (`?? []`, `?? false`) on columns that are `NOT NULL` in
the schema; the ones that can genuinely be null (`details`, `qr_code_url`, an
absent link array) are covered.

Full app suite: `npm test` in `webnegosyo-app/` — **86 suites, 1420 tests,
0 failures**. Types: `npx tsc --noEmit` clean. Lint: `npm run lint` — 0 errors,
7 warnings, all pre-existing patterns (the two `jsx-a11y/alt-text` warnings on
the new screens match `app/(main)/product/[productId].tsx`; React Native's
`Image` has no `alt` prop and both screens set `accessibilityLabel`).

## Known gaps and follow-ups

- **RLS does not enforce the `store_setup` grant.** `payment_methods_write_admin`
  (`0012_payment_methods.sql:75`) allows any `app_users.role = 'admin'` row, and
  per `20260710120000_staff_management.sql:3` *all staff are `role = 'admin'`
  with `is_owner = false`*. The tab gate above is therefore a UI boundary, not a
  database one — a cashier with the anon key could still write. This is the
  platform's existing posture for products and inventory too, and was flagged
  during planning; tightening it DB-side is separate, out-of-scope work.
- **No render tests.** The app has no React Testing Library / react-test-renderer
  installed and `jest.config.js` roots are `lib/` and `theme/` only, so screen
  behaviour is pinned by source-assertion guardrails. Interaction (tap, type,
  save) is unverified by machine.
- **Not exercised against a live tenant.** The QR upload path in particular
  needs a device check: uploads authorize via the deployed web app's
  `/api/imagekit/auth`, and the local `.env.local` points at an exhausted
  ImageKit account (see the `imagekit-upload-quota-block` note).
- **Reorder writes serially**, one `UPDATE` per method. Fine at the handful of
  methods a merchant has; it would need batching if that ever grew.
