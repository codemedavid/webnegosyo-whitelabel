# Delivery map accuracy: confirmed pins + rider-ready addresses (Apple Maps)

Date: 2026-10-20 · Status: **PLAN, awaiting approval** · Audit: memory `delivery-map-accuracy-audit`

## Goal

Every delivery order carries a pin at the customer's door, and the rider gets the
words that find it (unit, landmark, note). Pickup is the branch the order belongs
to. The map provider stays **Apple Maps** (owner's decision 2026-10-20; Google
and AWS GrabMaps were considered and not chosen).

Success measures (read from the platform DB, same queries as the audit):
- delivery orders with a pin: 69% → ≥ 95%
- pinned orders > 30 km from their pickup: 14% → < 2%
- Lalamove bookings with non-empty remarks: 0% → 100%

## Already done (2026-10-20)

- `tenants.lalamove_market` HK → PH for 7 Lalamove stores, all with Philippine
  addresses and all in sandbox: brue-coffee, cafejuancho, cold-treats-intramuros,
  kape-muna-kapebilidad, rrh-food-incorporated, sirwenzlomihouse, tophers-foods.
  Rollback: `update tenants set lalamove_market='HK' where slug in (…)`.
  The cause is the superadmin form defaulting new stores to `'HK'`
  (`tenant-form-wrapper.tsx:2104`), fixed in 1A-7.
- Still owed for the three Convex-backed ones (cafejuancho, kape-muna-kapebilidad,
  rrh-food-incorporated): push the corrected market to their Convex `tenantConfig`
  (`syncTenantConvexConfig`). This is done with the 1B-7 backfill, because those
  stores have no pickup pin and can't book yet anyway.

## Shape of the work

Two shippable halves:
- **1A** fixes the biggest causes now.
- **1B** is the confirm-pin flow on Apple Maps, the store pin editor and the
  pin backfill.

No database migration is needed. New values live in `orders.customer_data` (hidden
keys) and in columns that already exist (`outlets.latitude/longitude`,
`delivery_radius_km`).

---

## Phase 1A: quick fixes (~4 days)

### 1A-1 Rider remarks to Lalamove
- New pure `src/lib/delivery/rider-remarks.ts`:
  `buildRiderRemarks(customerData) → string`, ≤ 1,500 characters (Lalamove's limit).
  It holds these lines, in order:
  - unit / floor / building
  - landmark
  - note to rider
  - full address text
  - `Pin: https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`
- Field lookup by normalised key, the same shape as `isPhoneFieldKey`
  (`lalamove-recipient.ts:28`):
  - built-in keys `delivery_unit` / `delivery_landmark` / `delivery_rider_note` (from 1B-4)
  - plus merchant aliases:
    - landmark: `landmark`, `palatandaan`, `nearest…`
    - note: `note`, `instruction`, `remarks`, `request`
    - unit: `unit`, `floor`, `bldg`, `building`, `block`, `blk`, `lot`, `room`
  - Values are trimmed and cut to fit. Truncation drops the address text first,
    never the pin link or the landmark.
- `createLalamoveOrder` (`lalamove-service.ts:217`) takes `remarks`. Both callers
  pass `buildRiderRemarks(order.customer_data)`:
  - `actions/lalamove.ts:365`, which also covers auto-book in `orders-service.ts:424`
  - `api/lalamove/route.ts:193`, used by the merchant app
- Convex `bookLalamove` (`convex/lalamove.ts:317`) uses the same builder, a mirrored
  pure file. A parity test fails on drift, as with `lalamoveContact`. Then bump
  `CURRENT_SCHEMA_VERSION` and prebundle (memory `convex-tenant-deploy-pipeline`).

### 1A-2 Branch pickup
- New pure `resolveDeliveryOrigin(tenant, outlet | null)`: the branch's address + pin
  when the branch has a pin, else the store's. It returns `null` when neither has a
  pin (the existing "misconfigured" state).
- Server reads the outlet itself, never the client's coordinates. The outlet must
  be active and belong to the tenant.
  - `createQuotationAction`: new `outletId` argument.
  - `requoteLalamoveAction` and route op `requote`: `orders.outlet_id`.
  - `calculateDistanceDeliveryFeeAction`, `orders.ts:541` (`resolveOrderDeliveryFee`)
    and `api/maps/delivery-quote` all go through it. `orders.ts:347` already
    resolves the outlet; it selects lat/lng too.
- `use-delivery-quote.ts` request key includes the selected outlet id, so changing
  branch re-quotes.
- Quote signature (`delivery-quote-signature.ts`) also binds `outletId`, and the
  context moves to `lalamove-quote:v3`. A quote for branch A can't place an order
  for branch B. Quotes live 5 minutes, so a v2 quote in flight at deploy just
  re-quotes once.
- Convex stays on the store pin. Convex is legacy, and only cafejuancho has
  branches there.

### 1A-3 Search starts at the store, not Manila
- `AddressAutocomplete` gets a `biasCenter?: LatLng` prop, used for search bias and
  where the map first opens.
- Checkout passes the selected branch pin, else the store pin, else Manila.
  Data: `checkout.outlet.choices` / `checkout.tenant`.
- Apple and Mapbox use it in place of `DEFAULT_CENTER` (`apple-address-autocomplete.tsx:14`,
  `mapbox-address-autocomplete.tsx:24`). This fixes the Davao/Pampanga cases.

### 1A-4 Editing the address no longer drops the pin
- `applyDeliveryAddressChange` stores the picked label as a hidden
  `delivery_pin_address`.
- A text edit keeps the pin while the new text still contains the picked label
  (normalised case and spaces), so appending "Unit 5B" or a landmark is safe. This
  is the merchant app's rule (`AddressField.tsx:54-64`).
- Rewriting or clearing the label drops the pin, and the field says
  "Pick your address again so the rider gets the right pin."
- Hidden keys are added to `HIDDEN_FIELDS` (`customer-details.ts:25`):
  `delivery_pin_address`, then `delivery_pin_confirmed` (1B).

### 1A-5 "Is this the right spot?" checks
New pure `assessDeliveryPin({ pin, origin, radiusKm })`:

| Check | Effect |
|---|---|
| Pin outside the Philippines bounding box | Blocks the order |
| Pin within 30 m of the pickup pin | Warning: "This is the store's location — move the pin to your address" |
| Pin farther than the branch/store `delivery_radius_km`, or 30 km if none | Warning naming the distance and store: "This pin is 34 km from Brew Café" |

- Warnings need one tap: "Yes, deliver here".
- The server re-checks the block rule only.
- Shown under the address field in every design: classic and `CheckoutFields`.

### 1A-6 Merchants see the pin
- Web order detail (`order-detail-dialog.tsx:376`): the address row gets
  "Open in Google Maps", from `delivery_lat/lng`. It falls back to an address search.
- Merchant app order Delivery card (`[orderId].tsx:991`): same button, through the
  existing `googleMapsUrl` + `openExternalUrl`. Ships as an OTA.
- Both also show the landmark and the note to rider when present (same field lookup
  as 1A-1).

### 1A-7 Store pin input hygiene
- Superadmin form:
  - market defaults to `'PH'` and becomes a select of Lalamove markets
  - the manual latitude/longitude number inputs are removed; the pin comes from the
    map field and shows "Pinned at …"
  - the Hong Kong placeholders go
- Server, in `updateTenantDeliveryForAdminAction`, create/update tenant, and the
  outlet actions:
  - lat/lng must be both set or both empty
  - inside the Philippines when the market is PH
  - required when Lalamove or distance pricing is on
  - `|| undefined` (`tenants.ts:199,408`) is replaced, so a pin can be cleared
- The merchant app's superadmin lat/lng text fields stay for now (superadmin-only);
  noted as follow-up.

---

## Phase 1B: confirm-pin flow on Apple Maps (~5–6 days, no new keys)

Production already runs Apple Maps: `NEXT_PUBLIC_MAPS_PROVIDER` and
`APPLE_MAPKIT_*` are set on Vercel. So 1B builds on the existing MapKit JS field
and the Apple Maps Server API client. No new accounts or keys are needed.

Apple's search data is thinner in the Philippines than Google's. That makes the
confirm-on-map step and the landmark/note fields the main accuracy tool, rather
than the search results.

### 1B-1 New customer address flow (rebuild of `src/components/shared/apple-maps/`)
```
1  Search box (biased to branch/store, 1A-3) · [Use my location ±15 m]
2  Confirm on map: map moves under a FIXED centre pin, Satellite toggle,
   1A-5 warnings, [Confirm this spot]
3  Details: Unit/Floor/Building · Landmark · Note to rider
4  Review: small map snapshot + address + fee  [Change]
```
- Step 2 is a full-screen MapKit map, replacing today's draggable marker and inline
  map.
  - The centre is read on `region-change-end`.
  - Reverse geocoding runs **once, on Confirm**, not on every pan.
  - Satellite/Hybrid uses MapKit's map types.
- Some picks force step 2 with "Move the pin to your gate":
  - Apple results with no street-level part (no `subThoroughfare`/`thoroughfare`,
    only locality/sub-locality/barangay/postcode)
  - any map tap that lands on an area label
- "Use my location" asks for high accuracy. It shows ±metres and requires the
  map confirm when worse than 50 m.
- Step 3 fields are built in (`delivery_unit`, `delivery_landmark`,
  `delivery_rider_note`).
  - If the store already asks a landmark/note question (alias match, 1A-1), that
    built-in field is hidden, so nobody is asked twice.
- `delivery_pin_confirmed: 'true'` is stored when step 2 is confirmed.
- The review snapshot uses the existing signed Apple snapshot (`snapshot-url.ts`).
  A new storefront route `GET /api/maps/preview` is rate-limited per IP + store.
  Today's `/api/maps/snapshot` is merchant-app (bearer) only.
- When MapKit fails to load, the plain field remains. It now also shows the
  Landmark and Note fields, so the rider still gets directions.
- The fallback to Mapbox stays wired for a deploy without Apple keys.
- Reuses `AddressSuggestionList` / `useAddressSuggestions` (debounce,
  latest-answer-wins) and `useAppleAddressSearch`.

### 1B-2 Store and branch pin editor
- Delivery settings, the branch form and superadmin use the same step-2 map,
  defaulting to Satellite, with "Drag the map so the pin is on your entrance".
- On save, the server geocodes the address text with the Apple Maps Server API
  (`createAppleMapsClient().geocode`). If the result is street-level and more than
  2 km from the pin, the save asks "Your pin is 550 km from the address you typed —
  which is right?". It never overwrites the pin by itself.

### 1B-3 Store data backfill (script, before/after snapshot kept)
- Geocode the stores and branches with no pickup pin through the Apple Maps Server
  API. Set a pin **only** for street-level results (house number or street
  present).
  - Stores: brue-coffee, cafejuancho, chefoshi, kape-muna-kapebilidad,
    rrh-food-incorporated, tophers-foods
  - Branches: cafejuancho ×2, sample-demo ×1
- City-only or failed addresses get a merchant nudge to pin their entrance in the
  new editor. **seacook is live**, with "Lucena, Philippines" as its pickup.
  - Stores: seacook, retiro, all-must-go-garage-sale, plus any failures above.
- Then `syncTenantConvexConfig` for the Convex-backed stores touched. This also
  carries the HK→PH market fix to their Convex config.

### 1B-4 Cleanup (separate PR, one release later)
- Delete the unused `google-places-autocomplete.tsx`.
- Keep Mapbox only as the no-Apple-keys fallback. Its Manila bias is already
  removed in 1A-3.

---

## Cost

None new. Apple Maps on the web is free within its daily quota, which this project
already uses for search, snapshots and road distance. The new preview route and the
once-per-confirm reverse geocode add a few calls per order. That is well inside the
quota at about 90 delivery orders a month on platform stores.

## Tests (TDD, written first)

- **Pure:**
  - `rider-remarks` (aliases, truncation order, 1,500-character limit, Convex parity)
  - `resolveDeliveryOrigin`
  - `assessDeliveryPin`
  - `applyDeliveryAddressChange` (keep / drop rules)
  - the street-level test for Apple results
- **Server:**
  - quote / requote / book use the branch pin and send remarks: extend
    `actions/lalamove-actions.test.ts`, `api/lalamove-route.test.ts`,
    `lalamove-booking-service.test.ts`
  - v3 signature binds the outlet
  - store-pin validation in the tenant and outlet actions
  - preview route: zod, rate limit, signed URL only
- **UI:** extend `apple-address-autocomplete.test.tsx`
  - search → confirm → details
  - an area-level pick forces confirm
  - warnings need the tap
  - the MapKit-failure fallback keeps the Landmark/Note fields
  - order detail shows the map link
  - the app Delivery card
- **Live (opt-in):** `APPLE_MAPS_LIVE=1` runs ~20 real Philippine addresses through
  the Server API geocode and reports which come back street-level. That gives an
  honest picture of where Apple is weak.
- `npm run lint`, `npm run test`, `npx tsc --noEmit`, and the app's jest.

## Release

| Step | Ships |
|---|---|
| 1A web | Vercel |
| 1A Convex remarks | template bump + Deploy Schema |
| 1A app map link | OTA |
| 1B web | Vercel |
| 1B-3 backfill | script run (Apple server keys already in env) |

## Not in this plan (later phases)
- Saved addresses (Home/Work)
- Live tracking card (shareLink + rider)
- Storing Lalamove failure reasons and quote distances
- Rider-drop-off accuracy score
- Automating custom-domain referrer entries
- The merchant app's superadmin lat/lng fields
