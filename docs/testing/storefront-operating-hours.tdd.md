# TDD Evidence — Storefront operating-hours enforcement

**Source plan:** none. Journeys were derived during this TDD run from the request
"I want the closing time to be working — it should show on the items or on the
website that ordering is currently closed."

**Branch:** `feat/unified-modifier-groups`

## Background

`operating_hours` + `timezone` already existed on `tenants` (migration
`20260616300000`) and an admin editor already wrote them, but they were consumed
**only** by `advance-order-utils.ts` to bound scheduling slots. The storefront
never read them, so a shop with a 21:00 close time still accepted ASAP orders at
03:00. This change makes the closing time real for customers.

## User journeys

1. As a customer, when I open a store's menu outside its operating hours, I want
   to see that ordering is currently closed and when it reopens, so I don't build
   a cart I cannot submit.
2. As a customer, while the store is closed I should not be able to add items,
   buy now, or check out.
3. As a customer placing a *scheduled* (advance) order, I should still be able to
   pre-order while the shop is shut — that is the point of advance orders.
4. As a merchant, I want to opt in to enforcement, so a store that set hours only
   for scheduling is not suddenly closed.
5. As a merchant in Manila, "closed" must mean closed on **my** clock, not the
   visitor's browser timezone.
6. As the platform, a missing, partial, or malformed hours config must never
   silently shutter a storefront.

## Task report

### 1. Pure open/closed resolver (`src/lib/store-open-status.ts`)

Turns `(operating_hours, timezone, enforce_operating_hours, now)` into an
open/closed status with a reopening label. Timezone-aware via `Intl`, supports
overnight windows (18:00–02:00), and fails **open** on every ambiguity.

- RED: `npx jest --testPathPatterns="store-open-status"` →
  `Cannot find module '@/lib/store-open-status'` (compile-time RED, 3 suites failed).
- GREEN: same command → `Tests: 22 passed, 22 total`.

Guaranteed: enforcement is opt-in; unset/malformed/absent-weekday configs resolve
to open; the store's own wall clock decides; the closing minute counts as closed;
overnight windows work; the next-open label degrades to `null` when never open.

### 2. Customer-facing banner (`src/components/customer/store-closed-banner.tsx`)

- RED: `Cannot find module '.../store-closed-banner'`.
- GREEN: `Tests: 5 passed` — renders nothing while open, states that ordering is
  closed, states when it reopens, omits the reopen line when there is none, and
  carries `role="status"`.

### 3. Column wiring + server-side order guard

The feature depends on three tenant columns reaching the page. A column that a
page renders but the query never selects resolves to `undefined` — which this
resolver (correctly) reads as "no hours configured", i.e. the feature silently
no-ops after publish. A guardrail test pins both projections. The product-detail
projection was extracted from an inline query into
`src/lib/queries/product-detail-tenant-select.ts` to make it testable (columns
preserved verbatim, verified by diffing the original select).

- RED (scheduled bypass): `expect(received).toBeNull()` / received
  `"Ordering is currently closed. Ordering reopens tomorrow at 9:00 AM."`
- GREEN: `Tests: 11 passed`.

### 4. Live client hook (`src/hooks/use-store-open-status.ts`)

The menu page is ISR-cached (`revalidate = 300`), so a server-rendered
open/closed state would be up to five minutes stale *and* disagree with the
client's clock (hydration mismatch). The hook reports OPEN on the first render
and resolves the real state after mount, re-evaluating every 60s.

- RED: `Cannot find module '@/hooks/use-store-open-status'`.
- GREEN: `Tests: 7 passed`.

Note: the first-render assertion initially used `result.all[0]`, which does not
exist in `@testing-library/react` v16. The *test mechanism* was corrected to
record each render pass; the assertion itself was unchanged.

### 5. Runtime wiring (no new tests — covered by the units above)

| Surface | Behavior while closed |
|---|---|
| `menu-client.tsx` | Banner under the announcement bar; item selection refused with a toast |
| `product-detail-content.tsx` | Banner above the footer; Buy Now + Add to Cart disabled; add refused |
| `useCartView.requestCheckout` | Checkout refused with a toast (single choke point for all 5 cart designs) |
| `useCheckout` | `handleCheckout` + `handleQrHandoff` abort; **scheduled orders exempt** |
| `orders-service.createOrder` / `createOrderConvex` | Throws — authoritative, not bypassable by disabling JS |
| `operating-hours-card.tsx` | New opt-in switch, persisted via `updateOperatingHoursAction` |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A tenant that has not opted in is never closed | `store-open-status.test.ts:stays open when the merchant has not enabled enforcement` | unit | PASS |
| 2 | Missing / malformed hours never close a store | `store-open-status.test.ts:stays open when the hours JSON is malformed` | unit | PASS |
| 3 | An unconfigured weekday is open all day | `store-open-status.test.ts:stays open all day on a weekday that has no explicit configuration` | unit | PASS |
| 4 | Open/closed uses the store timezone, not the runtime's | `store-open-status.test.ts:reads the weekday and minutes from the store timezone` | unit | PASS |
| 5 | Before opening → closed, points at today's opening | `store-open-status.test.ts:is closed before opening time and blocks ordering` | unit | PASS |
| 6 | After closing → closed, points at tomorrow | `store-open-status.test.ts:is closed after closing time and points at tomorrow` | unit | PASS |
| 7 | The closing minute itself is closed | `store-open-status.test.ts:treats the closing minute itself as closed` | unit | PASS |
| 8 | Explicitly closed weekday closes all day | `store-open-status.test.ts:is closed all day on an explicitly closed weekday` | unit | PASS |
| 9 | Multi-day gaps name the weekday | `store-open-status.test.ts:names the weekday when the next opening is more than a day away` | unit | PASS |
| 10 | Overnight windows stay open past midnight | `store-open-status.test.ts:is open past midnight when the window wraps` | unit | PASS |
| 11 | Banner is silent while open | `store-closed-banner.test.tsx:renders nothing while the store is open` | unit | PASS |
| 12 | Banner states closure + reopening time | `store-closed-banner.test.tsx:tells the customer when ordering reopens` | unit | PASS |
| 13 | Storefront + product queries select all 3 columns | `store-open-wiring.test.ts:selects %s on the ... query` | unit | PASS |
| 14 | Server guard rejects a closed-hours order | `store-open-wiring.test.ts:rejects an order placed while the store is closed` | unit | PASS |
| 15 | Server guard still accepts scheduled orders | `store-open-wiring.test.ts:still accepts a scheduled order placed while the store is closed` | unit | PASS |
| 16 | First render is open (ISR/hydration safety) | `use-store-open-status.test.tsx:reports open on the first render` | unit | PASS |
| 17 | Status flips when closing time passes on-screen | `use-store-open-status.test.tsx:flips to closed when the closing time passes while the page is open` | unit | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom="src/lib/store-open-status.ts" \
  --collectCoverageFrom="src/hooks/use-store-open-status.ts" \
  --collectCoverageFrom="src/components/customer/store-closed-banner.tsx" \
  --testPathPatterns="store-open|store-closed"

All files                  |   99.71 |    92.94 |     100 |   99.71 |
  store-closed-banner.tsx  |     100 |      100 |     100 |     100 |
  use-store-open-status.ts |     100 |      100 |     100 |     100 |
  store-open-status.ts     |   99.61 |    91.54 |     100 |   99.61 | line 260

Tests: 45 passed, 45 total
```

Full suite: `npx jest` → `2334 passed, 3 failed`. The 3 failures are in
`webnegosyo-app/lib/order-item-images.test.ts` and
`webnegosyo-app/lib/printer-native-load.test.ts`; both were verified to fail on a
clean tree (stash + re-run) and are unrelated to this change.

`npx tsc --noEmit` → no errors under `src/`. `npm run lint` → no new errors or
warnings attributable to the changed files.

## Known gaps / follow-ups

- **The migration `20260725160000_enforce_operating_hours.sql` is not applied.**
  Until it runs, `enforce_operating_hours` is absent, the column reads as
  `undefined`, and the feature is inert — which is the intended safe default, but
  it means nothing changes for anyone until the migration lands.
- No E2E (Playwright) coverage; enforcement is verified at the unit level plus the
  server guard. A closed-store E2E walk-through is the natural next step.
- The banner uses fixed light-red colors rather than tenant branding fields. If
  merchants want to theme it, that is a Branding Studio follow-up.
- Line 260 of `store-open-status.ts` (the "closed forever, no reopening label"
  branch of `getClosedOrderError`) is exercised only through `getStoreOpenStatus`,
  not directly.

## Merge evidence (for squash)

- RED `3351438` — reproducers for the resolver, banner, and column wiring; failed
  with `Cannot find module` for all three new modules.
- RED `e7be13e` — reproducers for the live hook and the scheduled-order bypass;
  the bypass failed with an actual assertion error, not just a missing module.
- GREEN `7f33b1e` — resolver + banner + column + migration; 38 tests passing.
- GREEN `8774dfb` — runtime wiring across menu, product page, cart, checkout,
  order services, and the admin opt-in; 45 tests passing, coverage 99.7%.

> Note: commits `7f33b1e` and `e7be13e` also swept in unrelated files from a
> concurrent session in this shared working tree (`tenant-supabase-orders.ts`,
> `order-token.ts`, `app/actions/orders.ts`). Nothing was lost, but those files
> do not belong to this change.
