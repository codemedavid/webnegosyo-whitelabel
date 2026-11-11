# Admin order delivery card

On an order's dialog, the merchant sees the delivery details (address, unit, landmark, rider note, store
note), edits them, and sends the customer a pin link. The public pin page (`/<tenant>/pin/<orderId>?t=…`) shows
only the store and order number and lets the customer set the spot and rider words.

## Sub-features

- `card` region `Delivery details` shows the seeded unit/landmark/rider note.
- `edit` `Edit details` → `#delivery-store-note` → `Save` → toast `Delivery details saved`; stored in `customer_data.delivery_store_note`; fee unchanged.
- `pin-link` `Send pin link` → read-only input `#pin-link-<orderId>` with a signed 24 h token.
- `pin-page` shows "Sample Demo · Order #N", `Set your exact spot`, unit/landmark/rider fields; never name, phone, address, items or current pin.
- `pin-send` customer moves the pin, fills `#pin-landmark`, `Send my spot to the store` → `Thank you!`; stored landmark (repo QA spec).
- `stale-save` a save from a card opened before the customer moved the pin must not overwrite it (repo QA spec, `stale-save` note).

## How to get to it (user POV)

- `/admin/orders` → click `QA-SEED Maria` (or `QA-SEED Juan`) → tab `Delivery`.

## Driving it with Playwright

Preconditions:

- Hold lifted; seeded orders 1 (Juan) and 2 (Maria) pending/confirmed delivery.

- **Edit + link + page.** `npx playwright test -c .claude/skills/verify-webnegosyo/playwright.verify.config.ts --output "$EVIDENCE/pw-admin" admin -g "delivery card"`
  (both projects): proof `<p>-d1..d4*.png`, `<p>-pin-page-text.json`, finding `store-note-stored`, `pin-page` (leaks list must be empty).
- **Customer moves the pin + stale save.** The repo QA spec `orders: delivery card…` test (order 1).

## Gotchas

- Headless Chromium refuses clipboard writes unless the context grants `clipboard-write` (the verify config does).
- The seed re-run restores both orders' delivery details.
