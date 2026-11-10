# Thank-you and tracking

After placing an order the diner sees the designed thank-you page (seeded `delivery-app` design, 8 s
countdown), then the order tracking page (`/order/<id>?t=<HMAC token>`) with status, progress and bill.
Both show the stored order total.

## Sub-features

- `thank-you` "Order placed!", bill, details, payment method; total = `orders.total`.
- `tracking` header "Order #NN", progress steps, `Bill details` toggle, loyalty card; total = `orders.total`.
- `tracking-token` a tracking URL without a valid `t` is refused.

## How to get to it (user POV)

- Place an order (storefront-checkout) and wait; or open a seeded order's link printed by the seed
  (`http://sample-demo.localhost:3100/order/<id>?t=<token>`; token = HMAC-SHA256(API_SECRET, order id)).

## Driving it with Playwright

Preconditions:

- Seeded designs on (`checkout/confirmation/tracking_design_enabled = true`), `confirmation_redirect = countdown`.

- **Thank-you.** Covered by storefront `-g "order totals"`: screenshot `<p>-e3-thank-you.png`, finding `thank-you-total`.
- **Tracking.** Same test: `<p>-e4-tracking.png`, `<p>-e5-tracking-bill.png`; asserts the stored total is on the page.
- **Seeded order.** `-g "seeded tracking"`: opens seeded order 1 (`81d7fad6-539f-512b-b4e0-4a93c803c007`, ₱587), asserts
  `Order #` and the stored total, records security headers.

## Gotchas

- The thank-you page keeps the `/checkout` URL; only its content changes (no URL to wait on).
- A design re-published by the designer journey changes these pages until the seed is re-run.
