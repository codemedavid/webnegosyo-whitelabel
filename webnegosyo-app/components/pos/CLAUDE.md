# POS checkout questions and delivery: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## POS checkout questions & delivery (merchant app)

The register asks the storefront's own checkout questions (`customer_form_fields`, per order type) — all OPTIONAL at the counter.

- **Fields** (`webnegosyo-app/lib/pos-checkout-fields.ts`, resource `use-checkout-setup.ts`, optional offline-pack part): name/phone/table/address (incl. aliases like "Contact Number") map onto the register's existing controls; everything else is a custom question under the tender screen's folded "More details" (`CheckoutDetails`). Answers live in the cart store (`checkoutAnswers`, cleared with every sale) and are written to `customerData` under the field's own name — spread FIRST in `buildPosOrder`, so register keys always win.
- **Delivery sheet** (`components/pos/DeliverySheet.tsx` + `delivery/`): address type-ahead → `POST /api/maps/places` (Apple Maps Server API search, store-pin biased); a pick stores `delivery_lat/lng` (strings, like the web) and shows a static map (`/api/maps/snapshot`, signed Apple snapshot URL — no native map module; drag-pin needs an EAS build) + "Open in Google Maps". Appending to a picked address keeps the pin.
- **Fee**: `/api/maps/delivery-quote` runs the checkout's own ROAD-distance pricing; the app applies the free-delivery minimum and fills the box ("Auto") only when it is empty or still holds a suggestion — a typed fee always wins. Offline → straight line × 1.3, labelled "estimate". Lalamove stores get no suggestion.
- All three routes: bearer member of the store (`gateAppMapsRequest`), per-person burst + daily limits (shared Apple quota).
