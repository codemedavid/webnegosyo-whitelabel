# Lalamove in the merchant app — TDD evidence

**Date:** 2026-08-05 · **Branch:** `main` · **Source plan:** none; journeys derived during this TDD run from the reported symptom.

## Reported symptom

> On the webnegosyo-app there's no Lalamove integration — we can't see when to book or create the
> order for Lalamove, and we don't get to see any Lalamove status or link for tracking.

## Root cause

`components/LalamoveDeliveryCard.tsx` already existed and was already rendered by
`app/(main)/order/[orderId].tsx:756`. It was dead for one class of store, for two
independent reasons:

1. **Read side.** `toOrderDto` in `webnegosyo-app/lib/backends/supabase-orders.ts` never mapped
   `delivery_address` or any `lalamove_*` column. The card's first statement is
   `if (!hasQuotation && !hasOrder) return null`, so on any tenant served by the shared platform
   Supabase the card returned `null` — no Book button, no status, no tracking link.
2. **Write side.** All four operations were bound to Convex actions
   (`lalamove:bookLalamove` etc.). Those tenants have **no Convex deployment at all**, so even a
   rendered card could not act.

Scale, measured against production at the time of the fix:

| | count |
|---|---|
| Lalamove-enabled tenants on `order_backend = 'platform'` | 9 of 19 |
| …of those with no Convex deployment whatsoever | 8 |
| Orders carrying a Lalamove quotation or booking, on platform tenants | 33 of 43 |

Convex-backed tenants were unaffected and keep their existing path.

## User journeys

1. As a merchant, I want to see that a delivery order has a Lalamove quote, so that I know a rider
   can be booked for it.
2. As a merchant, I want to book the rider from the app, so that I do not have to open the web
   dashboard mid-service.
3. As a merchant, I want to see the live delivery status and driver, so that I can answer a customer
   asking where their food is.
4. As a merchant, I want a tracking link, so that I can forward it to the customer.
5. As a merchant, I want to add a priority fee or cancel, so that I can react when no driver is
   matching.
6. As a merchant on a store the app cannot act for, I want to be told where I *can* act, rather than
   tapping buttons that always fail.

## Task report

| # | Task | Validation command | RED | GREEN |
|---|---|---|---|---|
| 1 | Carry `delivery_address` + six `lalamove_*` fields onto the order DTO | `npx jest lib/backends/supabase-orders.test.ts` | compile-time RED — 9 × `TS2339: Property 'lalamove…' does not exist on type 'OrderDto'` | 34/34 pass |
| 2 | Transport seam picking Convex vs the web route per session | `npx jest lib/lalamove-service.test.ts` | `TS2307: Cannot find module './lalamove-service'` | 12/12 pass |
| 3 | `POST /api/lalamove` — book / sync / cancel / priority fee, server-side | `npx jest tests/unit/api/lalamove-route.test.ts` | 13/13 failed, route absent | 13/13 pass |
| 4 | Dispatch the card's buttons through the seam | `npx jest components/LalamoveDeliveryCard.test.tsx` | 4 failed / 3 passed — the four routing cases | 7/7 pass |

Compile-time RED is the intended signal for task 1: the new assertions reference fields the DTO did
not declare, which is exactly the defect.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A quoted-and-booked order carries its address, status, driver and tracking url onto the DTO | `supabase-orders.test.ts:carries the delivery address and every Lalamove field onto the DTO` | unit | PASS |
| 2 | A counter sale leaves the Lalamove fields undefined, so no panel appears on a walk-in | `supabase-orders.test.ts:leaves the Lalamove fields undefined on an order that was never quoted` | unit | PASS |
| 3 | A platform store routes to the web route; a Convex store stays on its deployment | `lalamove-service.test.ts:resolveLalamoveTransport` (5 cases) | unit | PASS |
| 4 | The operation posts with the merchant's own token, and carries the tip amount | `lalamove-service.test.ts:posts the operation with the merchant's own token` | unit | PASS |
| 5 | A refusal reports the server's reason, not a generic failure | `lalamove-service.test.ts:returns the server's refusal rather than a generic failure` | unit | PASS |
| 6 | A timed-out booking warns it may have landed, rather than advising a retry | `lalamove-service.test.ts:warns that a timed-out booking may still have placed a rider` | unit | PASS |
| 7 | An unauthenticated caller is refused (401) | `lalamove-route.test.ts:refuses an unauthenticated caller` | integration | PASS |
| 8 | A merchant cannot book a rider on another tenant's Lalamove account (403) | `lalamove-route.test.ts:refuses a merchant booking on another tenant` | integration | PASS |
| 9 | An order belonging to another tenant is never reachable (404, no API call) | `lalamove-route.test.ts:never books against an order belonging to another tenant` | integration | PASS |
| 10 | Booking records order id, status and tracking url on the order | `lalamove-route.test.ts:books a rider and records the tracking link on the order` | integration | PASS |
| 11 | An order that already has a rider cannot be double-booked | `lalamove-route.test.ts:refuses to book a second rider…` | integration | PASS |
| 12 | Booking is refused with no quotation, and when Lalamove is off for the tenant | `lalamove-route.test.ts` (2 cases) | integration | PASS |
| 13 | Sync writes live status, driver name and driver phone | `lalamove-route.test.ts:syncs the live driver details onto the order` | integration | PASS |
| 14 | Cancel calls Lalamove and records `CANCELLED` | `lalamove-route.test.ts:cancels a booked delivery…` | integration | PASS |
| 15 | A priority fee must be a positive amount (400, no API call) | `lalamove-route.test.ts:rejects a priority fee that is not a positive amount` | integration | PASS |
| 16 | The Lalamove reason ("Quotation expired") reaches the merchant | `lalamove-route.test.ts:reports the Lalamove reason…` | integration | PASS |
| 17 | Book and Sync go to the web route on a platform store, never to Convex | `LalamoveDeliveryCard.test.tsx` (2 cases) | component | PASS |
| 18 | A Convex store keeps using its own deployment's action | `LalamoveDeliveryCard.test.tsx:keeps using the Convex action` | component | PASS |
| 19 | Status and Track are visible on a booked delivery | `LalamoveDeliveryCard.test.tsx:shows the live status and a way to track…` | component | PASS |
| 20 | A store with no reachable backend explains itself instead of showing dead buttons | `LalamoveDeliveryCard.test.tsx:explains itself rather than offering a button that cannot work` | component | PASS |

## Suite results

- `webnegosyo-app`: **166 suites, 2611/2611 pass** (`npx jest`)
- web: **457 passed, 1 failed, 1 skipped** (`npx jest`). The single failure is
  `tests/unit/vouchers/engine-parity.test.ts`, which **pre-dates this work** — verified by stashing
  every changed path and re-running it, where it fails identically.
- `webnegosyo-app`: `npx tsc --noEmit` clean.
- `npx eslint src/app/api/lalamove/route.ts` clean.

## Known gaps and follow-ups

- **Not deployed.** The app changes need a rebuild before merchants see them; `/api/lalamove` needs a
  web deploy. Nothing here is live yet.
- **Unproven against the real Lalamove API.** Every test stubs `@/lib/lalamove-service`. The route
  reuses the same client functions the web dashboard already books with in production, but this
  exact path has not placed a real rider.
- **Quotation expiry is the likely next complaint.** Lalamove quotations expire in roughly five
  minutes. A merchant booking from the app well after checkout will get "Quotation expired" — now
  reported honestly rather than silently, but there is still no re-quote-from-the-app path. The web
  server action `checkQuotationValidity` exists; a re-quote flow does not.
- **Test file type errors.** `tests/unit/api/lalamove-route.test.ts` produces `TS2345` under a
  full-project `tsc` from untyped `jest.Mock` mocks. This matches the existing convention —
  `tests/unit/api/vouchers-redeem.test.ts` produces six of the same — and does not affect the Jest
  run or `next build`.
- **`useSafeAction` still calls Convex hooks unconditionally** on platform stores. Harmless (it
  returns an erroring thunk that is never invoked once routing is in place), but it is dead weight
  on that path.

## Merge evidence

Four checkpoint commits on `main`, in order:

| Commit | Stage |
|---|---|
| `876a5d4` | RED→GREEN — DTO projection |
| `beb0658` | RED→GREEN — transport seam |
| `08a2adc` | RED→GREEN — `POST /api/lalamove` |
| `650a520` | RED→GREEN + refactor — card dispatch, pure module split |
