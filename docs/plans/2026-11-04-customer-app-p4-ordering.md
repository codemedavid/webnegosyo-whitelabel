# Customer app — Phase 4: real orders (plan)

Goal: a signed-in customer places a real order from the store's app, it rings
the kitchen exactly like a web order, and they can follow it and see it in
their history. Built and proven on **platform Supabase first**, then Convex.

Live numbers (2026-11-04): 301 active stores — 169 pinned platform, 42 Convex,
the rest resolve through `resolveOrderBackend`; 0 tenant-DB stores. 27 have
Lalamove, 91 have a payment method that needs proof. Required custom checkout
questions beyond name/phone/address exist on only a handful of stores.

## 1. One order engine: extract `placeOrder` (no behaviour change)

`createOrderAction` (`src/app/actions/orders.ts`, ~770 lines in one function)
is the only place that reprices, checks stock, hours, branch, minimum, presell,
delivery fee, service charge, vouchers, Senior/PWD and then routes to the
backend. The app must go through the same gate, never a copy.

- New `src/lib/checkout/place-order/` (split by step, each file < 400 lines):
  `placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>` with a typed
  input object instead of 20 positional args, and a result union
  `{ok, order, orderToken, trackingToken} | {refused, error} | {lost, error}`.
- `createOrderAction` becomes a thin wrapper: same positional signature, same
  return shape, so the web checkout, Messenger fallback and every existing
  test stay untouched.
- Characterization first: run the existing createOrderAction suites before the
  move and keep them green after it without edits. Add a test for each result
  kind through the new entry point.

## 2. App draft → order lines (pure, server-side)

`src/lib/app-api/orders/draft-to-lines.ts`. The app sends ids, never prices or
labels (`appOrderDraftSchema`). For each line the server:
- loads the dish (tenant-scoped, branch overrides applied) and normalises its
  groups with the SAME function the catalog projection uses, so a group/option
  id the app saw is the id the server resolves;
- checks every picked option exists, is available, and each group's min/max;
- builds `option_ids` / `addon_ids` / `addon_quantities` and the display
  strings (`variation`, `addons`) the kitchen, receipts and Messenger print;
- sends price 0 so `loadAndPriceOrderLines` sets the real price.

Contact comes from the session (profile name + phone E.164), never the body.
`customerData` uses the keys the web writes (`customer_name`,
`customer_phone`, `delivery_address`, `delivery_lat/lng`, notes) plus a channel
marker `app` so analytics and Reports attribute these orders (today POS/QR
orders were once counted under no channel — not repeating that).

## 3. Which orders belong to whom: `customer_app_orders` (migration)

Service role only (no anon/authenticated grants), PGlite-tested:
`id, tenant_id, app_id, customer_id, backend, order_id, idempotency_key,
state ('placing'|'placed'|'failed'), summary jsonb (lines with selections,
totals, order-type and branch names), last_status, placed_at`.
Unique `(tenant_id, idempotency_key)` and `(tenant_id, backend, order_id)`;
index `(tenant_id, customer_id, placed_at desc)`.

- **Idempotency**: the app sends `Idempotency-Key` per checkout attempt. The
  route claims the key row first. Retry of a placed key → the same order.
  Retry while `placing` → "still placing", never a second order. Platform also
  passes the key as `clientOrderId`, so its unique index dedupes too; on
  Convex the claim row is the only dedupe, so a stale `placing` row answers
  "check your orders" and is never re-run.
- Works the same on every backend, so history and tracking don't need a
  "find orders by phone" query per backend.

## 4. Routes (`/api/app/v1`, via `appRoute`, Bearer session required)

| Route | Does |
|---|---|
| `POST orders` | draft → `placeOrder` → index row → `AppOrderDetail`. Refusals come back as `refused` with the store's own wording; a lost order as `unavailable` |
| `GET orders/[id]` | the caller's own row only; live status, payment status and promised-ready time from `fetchOrderTrackingContext` with the minted tracking token (all backends); lines/totals from the snapshot |
| `GET me/orders` | 20 per page (cursor); refreshes live status for at most 5 non-terminal orders, timed, and writes it back |
| `GET places?q=` | address type-ahead through the Apple Maps Server API core the POS already uses, biased to the store pin; per-IP + per-session limits |
| `POST delivery/quote` | `{outletId, address, lat, lng}` → `{fee, etaMinutes, quoteToken?}` — road-distance pricing + free-delivery minimum (same code as checkout); Lalamove stores get a signed quotation |
| `POST vouchers/preview` | the checkout's voucher preview on the server-priced lines |

Contract changes (web `src/lib/app-contract` + app copy, parity test):
`deliveryAddress` → `delivery {address, lat, lng, quoteToken?}`; new
`paymentReference`; `rewardId` must be null until Phase 5.

## 5. App (`customer-app/`)

- `live-source.ts` implements `placeOrder`, `getOrder`, `getOrders`,
  `quoteDelivery`, `previewVoucher` (fixtures stay for the demo mode).
- Address search sheet → picked place feeds the quote; any edit voids it
  (already how `use-checkout` treats the fee).
- Idempotency key lives in the cart store per attempt; a fresh key only after
  success or an edit to the bag.
- Refused → show the store's message, keep the bag. Lost → "We couldn't
  confirm your order — check Orders before trying again".
- Order screen polls every 15 s while active and stops at a terminal status
  (push replaces this in Phase 7).

## 6. Proving it (platform first)

- Unit/property: draft translator (every group shape: modifier groups,
  variation types, legacy variations, add-ons with portions, linked options,
  branch overrides), result mapping, idempotency states, route auth (another
  customer's order = 404), 1000-row-safe history paging.
- PGlite runner over the real migration: anon/authenticated refused on every
  operation; unique keys hold.
- Live, opt-in `CUSTOMER_APP_ORDERS_LIVE=1`: a session created directly for a
  test customer on the demo store (sign-in's SMS sender is still blocked),
  place a real platform order → assert the row, the kitchen push trigger, stock
  movement, voucher burn, channel = app → cancel it. Then the same on one
  Convex store you name.
- Probe the applied migration on the platform DB, regenerate types via MCP.

## Not in Phase 4

Rewards at checkout (P5), PayMongo (P6), push (P7), combos/bundles, advance
(scheduled) orders, the store's custom checkout questions, dine-in table QR.

## Decisions (owner, 2026-11-04)

1. Payment proof: typed reference number in the app now; screenshot upload later.
2. Lalamove: delivery in the app now, via the signed quotation.
3. History: app orders only.
4. Live proof on platform Supabase only — no Convex test order. Convex stores
   still go through the shared engine (same code as the web), unit-tested only.
