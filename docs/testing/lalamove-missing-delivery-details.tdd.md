# TDD Evidence — Fix: "Order missing delivery details" when booking Lalamove from the app

**Date:** 2026-07-02
**Source plan:** none — journeys derived during this TDD run from a bug report.

## Bug report

In the merchant app (`webnegosyo-app`), tapping **Book Lalamove Delivery** on a
web-originated order fails with **"Order missing delivery details."**

## Root cause

Delivery details are collected by the web checkout and stored inside the
free-form `customerData` bag as `delivery_address`, `delivery_lat`, and
`delivery_lng` (strings). When the order is created in Convex,
`createOrderConvex` (`src/lib/orders-service.ts`) forwarded `lalamoveQuotationId`
but **never promoted** those values onto the top-level Convex order columns
(`deliveryAddress` / `deliveryLatitude` / `deliveryLongitude`).

`convex-template/convex/lalamove.ts` `bookLalamove` guards on the top-level field:

```ts
if (!order || !order.lalamoveQuotationId || !order.deliveryAddress) {
  return { success: false, error: "Order missing delivery details" };
}
```

So every Convex order reached the app with a quotation but no `deliveryAddress`,
and the booking was rejected.

## User journeys

1. As a merchant, when I book a Lalamove delivery for a web order that captured a
   delivery address, the booking should proceed (address + coordinates present on
   the order).
2. As the system, when an order has no delivery address (e.g. pickup), I should
   not fabricate delivery fields.

## Fix

- New pure helper `buildLalamoveDeliveryArgs(customerData)` in
  `src/lib/lalamove-order-details.ts` — extracts and coerces
  `delivery_address` / `delivery_lat` / `delivery_lng` into the top-level Convex
  fields, omitting absent/invalid values.
- `createOrderConvex` (`src/lib/orders-service.ts`) now merges the helper's
  result into the Convex mutation args.

The Convex `createOrder` mutation already accepts and persists these optional
fields (`convex-template/convex/orders.ts:28-30,94`), so no Convex redeploy is
required.

## RED / GREEN evidence

| Stage | Command | Result |
|-------|---------|--------|
| RED | `npx jest --testPathPatterns="lalamove-order-details"` | `Cannot find module '@/lib/lalamove-order-details'` — module absent (intended failure) |
| GREEN | `npx jest --testPathPatterns="lalamove-order-details"` | 9 passed |
| Regression | `npx jest` | 71 suites, 985 tests passed |
| Lint | `npx eslint src/lib/lalamove-order-details.ts src/lib/orders-service.ts` | clean |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `delivery_address` is promoted to `deliveryAddress` | `lalamove-order-details.test.ts` | unit | PASS |
| 2 | String coordinates parse to numeric lat/lng | `lalamove-order-details.test.ts` | unit | PASS |
| 3 | Numeric coordinates pass through | `lalamove-order-details.test.ts` | unit | PASS |
| 4 | Missing / blank address is omitted | `lalamove-order-details.test.ts` | unit | PASS |
| 5 | Missing / unparseable coordinates are omitted | `lalamove-order-details.test.ts` | unit | PASS |
| 6 | Undefined / empty `customerData` → `{}` | `lalamove-order-details.test.ts` | unit | PASS |

## Known remaining gaps

- **QR-handoff orders** created directly in the mobile app
  (`webnegosyo-app/app/(main)/scan.tsx`) still do not capture a delivery
  address, so booking Lalamove for those specific orders would also fail. Those
  are counter/pickup handoffs; if delivery-via-QR-handoff is required, the QR
  payload must carry the address and `createOrder` args must include it. Out of
  scope for this fix, which targets the primary web-order → app path.
