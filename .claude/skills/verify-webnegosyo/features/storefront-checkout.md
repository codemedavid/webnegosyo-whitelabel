# Storefront checkout

A diner opens the sample-demo menu, adds dishes (variation types, add-ons, quantities) to the cart, and
places a dine-in, pickup or delivery order through the seeded Page Designer checkout, answering the store's
own questions and optionally applying a voucher. The order row stores exactly the total the diner saw.

## Sub-features

- `menu-add` adds QA dishes with options (Large, Extra rice) and quantity; `QA Cheese Bread` is auto-86'd (stock 0).
- `order-types` Dine In / Pick Up / Delivery each show their own `qa_*` questions.
- `voucher` `QA10OFF` (10%, cap ₱100), `QA50FRIES` (50% off ONE fries), `QA20PESO` (₱20, min ₱150).
- `required-questions` a required question blocks the form; a stale tab is refused and marked; a forged call is refused server-side.
- `delivery-address` address search, "Pick on the map", unit/landmark/rider note; no "I can't find my place".
- `delivery-pricing` a delivery with no pin is priced or refused like any other (Lalamove store: refused without a quote).
- `totals` submit button amount = `orders.total` = Σ `order_items.subtotal` − `discount_total` (+ fee).

## How to get to it (user POV)

- `http://sample-demo.localhost:3100/menu` → tap a dish → `Add To Cart` → cart icon / `/cart` → `Proceed to Checkout`.
- Direct `/checkout` with a cart in localStorage.

## Driving it with Playwright

Preconditions:

- Doctor OK; the five `qa_*` questions optional; no `QA-SEED verify*` order expected.

- **Totals.** Run `npx playwright test -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts --output "$EVIDENCE/pw-store-<p>" --project=<p> storefront -g "order totals"`.
  Adds Inasal Large + 2 Fries, dine-in, `QA10OFF`, `PAY AS YOU ORDER`. Proof: `<p>-order-row.json` (total, discount_data,
  order_items), button text `Proceed to Payment · ₱350.10`, thank-you + tracking show the same amount.
  It also captures the browser's `createOrderAction` POST (`Next-Action` id + JSON args) for the next two.
- **Required question.** `-g "required question"`: opens checkout, THEN `db.mjs question require qa_birthday`, submits the
  stale tab (expects to stay on `/checkout`, inline `Please tick “Someone’s birthday today (QA)”`, `aria-invalid="true"`),
  replays `createOrderAction` without the answer (expects `"refused":true` + `fieldErrors[qa_birthday]`), opens a fresh tab
  (form blocks), restores the question, and asserts no order was written.
- **Delivery.** `-g "delivery"`: Delivery tab shows `Need cutlery? (QA)`, no `/can.t find my place/` button or text, no
  Lalamove wording, address search suggestions counted; replays `createOrderAction` as a delivery with
  `delivery_pin_skipped: 'true'`, no pin, fee 0 → expects `"refused":true` and no row.
- **Repo QA journey.** `QA_SHOTS_DIR="$EVIDENCE/qa-shots" npx playwright test -c playwright.qa.config.ts --output "$EVIDENCE/pw-qa"`
  covers item sheet options, per-type questions, map dialog + pin drag (desktop), pickup required select, `QA50FRIES` (phone).

## Gotchas

- Run each project's `order totals` before its `required question` / `delivery` tests (they reuse its captured call).
- Lalamove is on with sandbox keys in production mode, so no delivery order can be placed from the UI.
- Delivery's own required "Date & Time" is `input[type=number]`; pickup's "Pickup Date & Time" `<select>` may be empty → pickup can't be placed.
- MapKit gates the map buttons on `status === 'ready'`. Under load it took >15 s on phone emulation (buttons greyed, search 0 results, admin map preview blank); after 20 s it was ready with 8 suggestions (2026-11-10 probe). Wait for `Pick on the map` to be enabled (`toBeEnabled({ timeout: 60_000 })`) before judging search or pins.
- The voucher field on the seeded design is a link `Have a voucher?` on some layouts and an inline box on others.
- Each placed order pings the demo owner's phone; don't loop.
