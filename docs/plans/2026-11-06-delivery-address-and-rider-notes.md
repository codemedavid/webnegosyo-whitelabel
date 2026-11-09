# Delivery address and rider notes: research and plan

Date: 2026-11-06 · Status: **PLAN, awaiting owner approval** · Follows: `docs/plans/2026-10-20-delivery-map-accuracy.md`

## The question

The owner asked three things:
- Can we add notes to a Lalamove delivery?
- Why is pinning hard and slow, with some places missing?
- What is the right approach to the delivery address?

## Short answer

Treat search as the way to reach the **neighbourhood**, the map as the way to reach the **door**, and words as the way to reach the **gate**. No provider we can use has house-level data for most of the Philippines, so better search alone won't fix this.

Most of the time is lost in our own flow, and the fixes don't need a provider switch.

## Evidence

### Live orders (platform DB, last 14 days, orders with a delivery address)

| Source | Orders | Pinned | Landmark | Unit | Rider note |
|---|---:|---:|---:|---:|---:|
| Web checkout | 101 | 69 (68%) | 25 | 24 | 14 |
| POS / register | 69 | 5 (7%) | 0 | 0 | 0 |

- Only 4 of the 170 orders came from Lalamove stores, and 1 was booked. Convex stores are not counted here.
- 27 active stores have Lalamove on, and 10 of those are out of sandbox.
- So this work has to serve **own-rider stores** too, not only Lalamove.
- The 2026-10-20 target of at least 95% pinned was not reached. Web checkout is still at 68%.
- Only 1 pinned order was more than 30 km from its store, so the far-pin problem looks much smaller. The earlier 14% figure may not be strictly comparable, because this count measures from the store's main pin.

### Search test (Apple, Mapbox, OSM)

Queries were hand-written and used public places plus invented house numbers. No customer data was sent.

| Test | Apple | Mapbox | OSM |
|---:|---:|---:|---:|
| 34 place names (subdivision, barangay, POI, street, purok) | 32 | 27 | 31 |
| 16 full addresses as customers type them | 11 | 14 | 2 |
| Same 16 with door and direction words removed | **15** | 14 | 13 |

**Limits of this test:**
- It is small, and I chose the queries.
- A hit means the right name within 12 km in the top 5. It does not mean the right door.
- **Google was not tested**, because there is no key in this environment.

**What it shows:**
- Apple finds places well enough. Its failures come from the extra words in a typed address. For example, "likod ng Paniqui Public Market" returned one result in Lubao, Pampanga, and "Purok Mangga" became "Mango Street".
- Results look more exact than they are:
  - Apple echoed invented house numbers ("123 Zamora Street", "45 Rose Street", "18 Edison Street").
  - Apple and Mapbox both return other people's entries as places ("Blk 4 Lot 20 Camella Homes…", "Beautiful new 3 level luxury Town House…").
- These results are risky because a customer typing "Blk 4 Lot 12" can pick "Blk 4 Lot 20", and `handleSuggestionPick` overwrites their text with it.

### Map step

Snapshots at street level in Mintal and Paniqui, plus code reading (`pin-confirm-dialog.tsx`, `apple-address-autocomplete.tsx`):
- Delivery opens on the **Standard** map, which shows beige blocks with no houses. Hybrid shows roofs people can recognise. Store pins already default to satellite.
- There is **no search inside the map**. A wrong start means Cancel and search again.
- There is **no live address** while the map moves. Reverse geocoding only runs on Confirm, so people move the map blind.
- "Pick on the map" opens at the store, far from the customer.
- The map opens in a dialog at 55vh, not full screen on a phone.
- I found **no saved address** on web checkout, so returning customers appear to start over every time.
- Nothing measures this: no count of zero-result searches, time to confirm or abandons.

### Notes

- Customers can already leave unit, landmark and rider note at web checkout. They reach the rider through `recipients[].remarks` (limit 1,500 characters) on all booking paths.
- **Merchants cannot** see what the rider will read, add a note, or fix an address or pin on a placed order.
- **The POS has no unit, landmark or note fields**, and its pin comes only from a search pick.
- Lalamove's docs say to use `\r\n` for line breaks, and we send `\n`. I don't know if this breaks anything. It is a cheap fix.

### Provider options

| Option | Finding | Decision |
|---|---|---|
| Google Places + Maps | Likely the most places, but untested here. Its terms bar use with a non-Google map, so search alone can't be swapped: the customer map must change too. Lat/lng caching was limited to 30 days in the archived terms, and we store pins on orders forever. Volume looks inside the free tier (10,000 map loads a month, about 220 web delivery orders a month, Convex excluded). | Test before deciding. Read the current terms first. |
| Google Address Validation | The Philippines is not in the coverage table. | Rule out |
| GrabMaps through AWS | Built for Southeast Asia, with motorcycle routing. No independent accuracy data. Adds a new vendor. | Not now |
| what3words | Used by one PH delivery company, but customers and riders would have to learn it. | Rule out |
| Region → barangay dropdowns | Clean data but slower, and a pin is still needed. A pin-to-barangay check needs boundary data we don't have. | Rule out |

The owner chose Apple on 2026-10-20. Nothing here justifies reversing that yet.

## Plan

### Part 1: Faster, more accurate address on web checkout

Web deploy only, no migration.

1. **Satellite by default** for delivery, with one tap back to Map.
2. **Full-screen map on phones**, with **search inside the map**.
3. **Live label under the pin** ("Near Zamora St, Samput, Paniqui"), looked up when the map stops moving and reusing the existing 4-decimal cache. It must say "near", never claim a house number.
4. **Clean the search query** (pure, tested module): remove Blk/Lot/Phase/Unit/Purok/house numbers and leading "near/beside/likod ng/tapat ng". Search with the raw text and the cleaned text, then merge.
5. **Rank junk lower**: results that start with Blk/Lot or carry a typed house number.
6. **Stop rewriting the customer's words.** Search sets the area, and "House / Blk / Lot / Unit" is its own field. The rider sees the customer's text, not a near match.
7. **Accept a pasted Google Maps link or coordinates.** Short links need a server redirect lookup limited to Google's hosts, with no other host followed.
8. **Remember the last 3 addresses** on the device, per store, with a way to delete them. Pins skip the map step when reused.
9. **Better first screen**: Use my location, search, saved addresses. "Pick on the map" starts from GPS when allowed.
10. **Measure**: searches with zero results, time from first keystroke to Confirm, abandoned map opens, whether the pin came from GPS, search, a link or a saved address. Counts only, with no address text.

### Part 2: Notes the merchant controls

1. **"What the rider will read" preview**, with a merchant note box before booking, in the web panel and the app card.
2. Stored as a new `customer_data` key and added to `buildRiderRemarks`, with the Convex mirror kept in step.
3. **Unit, landmark and note fields on the POS `DeliverySheet`.**
4. Use `\r\n` in remarks.
5. **"Copy for rider"** (address, details, pin link) for own-rider stores.

Ships as: web deploy, app OTA for 1.0.18+ (older builds need the new binary), then Convex bundle + Bulk Deploy for Convex stores.

### Part 3: Fix the pin after the order

1. **"Send pin link"** from the order screen, shared through the merchant's own SMS or Messenger. The customer drops their pin on the same map, so the register doesn't need a native map. This is the real fix for the POS's 7%.
2. **Merchant can edit** the address, details and pin before booking. A requote then uses the new pin.
3. Public write path: order token proof, service-role write, rate limit, refused once a rider is booked. Needs a security review, and RLS tested as anon.

### Later, only if the data asks for it

- Google test with a free key: same queries plus real zero-result counts from Part 1.
- Lalamove `PATCH /v3/orders/{id}` (one edit, before pickup, price may change), priority fee, webhooks.
- PH special requests from `GET /v3/cities` (not checked, needs a Lalamove key).
- Lalamove's `item` details are documented as Thailand, Vietnam and Hong Kong only, so not for PH.

## Success measures

Read from the platform DB after 14 days:
- Web checkout pinned: 68% → at least 90%
- POS deliveries pinned: 7% → at least 50%
- Median time from first keystroke to Confirm: baseline from Part 1, then lower
- Rider gets at least one of unit, landmark or note: tracked for web and POS

## Decisions needed

1. **Must a pin be required?** Recommendation: required where the fee or booking needs it (Lalamove, distance pricing), with "I can't find my place" sending the order through with a note and a store call. Optional with a nudge on flat-fee stores.
2. **Pin changed after the order: does the fee change?** Recommendation: no automatic change. Show the merchant the new distance and let them decide.
3. **Google test:** can the owner provide a key with billing on and a low cap? Optional. Parts 1 to 3 don't depend on it.

## Testing

- Pure modules first (query cleaner, ranking, link parser, remarks): TDD, including a property test that remarks stay within 1,500 characters.
- Parity test between web and Convex remarks stays green.
- Phone-width browser check of the full flow against the platform backend.
- One real sandbox Lalamove booking, reading back `remarks` from `GET /v3/orders/{id}`.
