# Lalamove: bookings refused with "'' is not valid 'phone'" (2026-09-09)

## Symptom (merchant app, seacook)
Booking a quoted delivery failed with `ERR_INVALID_FIELD: '' is not valid 'phone'.
Phone must be in E.164 format`, and a delivery order whose checkout-time quote was
missing showed no Lalamove card at all ("no quotation").

## Root causes
1. Every booking path (web route `/api/lalamove`, server action
   `createLalamoveOrderAction`, Convex `lalamove:bookLalamove`) forwarded
   `customer_contact` verbatim as the recipient phone. A tenant checkout form with
   no phone field stores `''` — live seacook order `jh7dv43k…` (customerContact
   `""`, customerData has no phone) — and Lalamove refuses it.
2. `deployConvexToTenantAction` synced `lalamove_sender_phone ?? footer_phone ?? …`,
   so a cleared field (`''`) never fell through to the footer numbers.
3. The app card returned `null` when an order had no quotation, so a delivery with
   an address but a failed checkout quote had no way to get one from the phone.

## RED → GREEN
| Test | RED | GREEN |
|---|---|---|
| `tests/unit/lib/lalamove-recipient.test.ts` (5) | Cannot find module | pass |
| `tests/unit/lib/lalamove-phone.test.ts` +3 (`isE164Phone`, formatting inside `+` numbers) | not a function | pass |
| `convex-template/convex/lalamoveContact.test.ts` (7, mirror) | Cannot find module | pass |
| `tests/unit/api/lalamove-route.test.ts` +3 (store fallback, customer_data recovery, bad pickup phone) | fail | pass |
| `tests/unit/actions/lalamove-actions.test.ts` +2 | fail | pass |
| `webnegosyo-app/components/LalamoveDeliveryCard.test.tsx` +2 (quote from an unquoted delivery, store-phone notice) | fail | pass |

Final: web 143/143 across 11 Lalamove/Convex suites; app 36/36 across 3 suites.

## Fix
- `src/lib/lalamove-recipient.ts` + `convex-template/convex/lalamoveContact.ts`:
  customer phone from `customer_contact` or any phone-named `customer_data` field,
  else the store phone (`source: "store"`), else refuse. Both booking results carry
  `recipientPhoneSource`; the app alert and the web panel toast say when the rider
  will call the store.
- `isE164Phone` gate on the sender phone with a message naming the number.
- Convex `bookLalamove`: distinct "no quotation" / "no address" reasons (the app
  offers Get New Quote on the former), Lalamove `detail` surfaced in errors.
- Convex bundle rebuilt, `CURRENT_SCHEMA_VERSION` 25 → 26.
- App card: "Get Lalamove Quote" on an unquoted delivery with an address.

## To go live
1. Deploy web (route + action + panel).
2. Superadmin Bulk Deploy (pushes v26 and re-syncs `lalamove_sender_phone`).
3. EAS Update for the app JS (card + service are OTA-able).

## Platform-database pass (same day)
Verified against the live schema: `public.orders` has NO `delivery_address` column
(address lives in `customer_data.delivery_address`). Two app defects followed:

4. `toOrderDto` read only `row.delivery_address` → every platform delivery order
   reached the order screen with no address, and the new "Get Lalamove Quote"
   fallback could never appear on platform stores.
5. `buildCreateOrderRows` wrote a `delivery_address` column on the register insert →
   PostgREST refuses an insert naming an unknown column (PGRST204). Consistent with
   the live data: zero `source = 'pos'` orders on any platform tenant in 60 days.

| Test | RED | GREEN |
|---|---|---|
| `supabase-orders.test.ts` "reads the delivery address from the customer_data blob" | undefined | pass |
| `supabase-orders.test.ts` "never writes a delivery_address column" | column present | pass |

App: 870/871 across 62 suites (the one failure, `DiscountSheet.test.tsx`, is a
parallel-run timing flake — passes alone, untouched by this work).

The platform booking path itself (app → `POST /api/lalamove` → route) is covered by
the route tests above; the card's quote-from-nothing test runs under a platform
session. Requote on platform needs `delivery_lat/lng` in `customer_data`, which the
register does not capture — it refuses with "no delivery coordinates" by design.

## Admin + live seacook pass (2026-09-09)

**Report:** "the lalamove book is missing on the admin even though we created an order with lalamove."

**Root cause:** seacook is a Convex tenant. The web admin's Convex order sheet
(`convex-order-sheet.tsx`) rendered Lalamove status read-only — no Book, Quote,
Sync, or Cancel existed for Convex orders at all. The Supabase dialog also
keyed its Delivery tab on "has quotation or fee", and its Create button stayed
disabled on a blank `customer_contact` (the red "contact required" text never
went away in the first pass).

**RED → GREEN**
- `tests/unit/components/admin/convex-lalamove-panel.test.tsx` (5) — new
  `ConvexLalamovePanel` driven by `lalamove:*` actions via `useConvexLalamoveActions`.
- `tests/unit/components/admin/lalamove-delivery-panel.test.tsx` (2) — button
  enabled on blank contact; "Get Lalamove Quote" for an unquoted delivery.
- `tests/unit/components/admin/order-detail-dialog-delivery-tab.test.tsx` (2) —
  Delivery tab keyed on order TYPE (`shouldShowLalamoveControls`).
- `lalamove-recipient` + `lalamoveContact` (+2 each) — phone field matched by
  normalized label (`isPhoneFieldKey`): seacook's live form stores "Phone".

**Live on seacook (production Lalamove, sandbox=false)**
- Deployed Convex v26 via a local mirror of `deployConvexToTenantAction`.
- First requote failed: "right credentials for the corresponding environment".
  `tenant_secrets` held `pk_test_` keys; `tenants` columns held `pk_prod_`.
  Production web still runs the pre-secrets code and writes the columns, so the
  9/4 backfill went stale for 7 tenants (seacook keys; 6 tenants' deploy keys).
  Re-synced `tenant_secrets` from the columns (drift now 0); the drop-columns
  migration already re-copies before dropping, so the deploy path is safe.
- Requote on order `jh7dv43k…` → `{ success: true, price: "66", quotationId: "3580500313498678041" }`,
  stored on the order; customer's ₱60 fee untouched by design.
- Book preflight on an unquoted order → "This order has no Lalamove quotation yet — get a new quote first".
- A real booking was NOT placed (it dispatches a paid rider to a real address).
