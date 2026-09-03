# SmartMenu — next release (rebrand + receipts)

Covers everything merged since `825d016` ("bump version to 1.0.4 for the printer fix
release", 2026-08-26) plus the WebNegosyo → SmartMenu rename.

**Version:** see "Before you submit" below — the version number is the one thing in this
document that has to be checked against App Store Connect rather than assumed.

---

## App Store "What's New" (recommended — ~1,120 characters, limit 4,000)

```
WebNegosyo is now SmartMenu. Same app, same login, same store — new name and new look.

Receipts, your way
• Choose how your receipts print: Classic, Compact or Detailed. Compact saves paper on
  busy days; Detailed spells out every modifier for the kitchen.
• Design the receipt once from your store settings and every device prints it that way.
• Print a QR code on the receipt so the customer can scan and follow their order
  instead of calling to ask where it is.

Delivery on the Register
• Ring up a delivery straight from the Register: add the delivery fee, the address and
  the customer's phone number as you take the order.
• The total updates the moment you change the delivery details, so what you charge is
  what you collect.
• Forgot the fee, or quoted it wrong? Add or correct the delivery charge on an order
  that has already been placed, and settle the difference.
• The delivery address now shows on the order itself, not buried in the order notes.

Fixes and polish
• Fixed the cash total not updating after a delivery fee was edited mid-sale.
• General stability and performance improvements.
```

Character count: ~1,120.

### Shorter alternative (~590 characters)

```
WebNegosyo is now SmartMenu — same app, same login, new name and new look.

• Receipt formats: choose Classic, Compact or Detailed, set it once in your store
  settings, and every device prints it that way.
• Print a tracking QR on the receipt so customers can follow their order themselves.
• Take a delivery on the Register: fee, address and phone as you ring up the sale, with
  the total updating as you go.
• Add or correct a delivery fee on an order that has already been placed, and settle
  the difference.
• Fixed the cash total not updating after a mid-sale delivery fee edit.
```

---

## Google Play "What's new" (~480 characters, limit 500)

```
WebNegosyo is now SmartMenu — same app, same login, new name and new look.

Receipts: pick Classic, Compact or Detailed, set it once in your store settings, and
every device prints it that way. Print a tracking QR so customers can follow their own
order.

Register: take a delivery with fee, address and phone as you ring up the sale, and add
or correct a delivery fee on an order that's already been placed.

Fixed: cash total not updating after a mid-sale delivery fee edit.
```

Character count: ~480. Play counts the blank lines, so this is close to the ceiling —
drop the middle paragraph break if the console refuses it.

---

## App Store Connect — rename fields

The binary carries the home-screen name (`app.config.ts` → `name`). These are separate
and must be edited by hand in the console:

| Field | Where | New value |
|---|---|---|
| App Name | ASC → App Information | `SmartMenu` |
| Subtitle | ASC → the version's App Store page | e.g. `Growing restaurants. Together.` (30-char limit) |
| Promotional text | ASC → version page | optional |
| Icon | Carried by the build — no console action | — |
| Bundle ID | **Do not touch** (`com.webnegosyo.admin`) | unchanged |

Play Console equivalents:

| Field | Where | New value |
|---|---|---|
| App name | Play Console → Main store listing | `SmartMenu` |
| Short description | Main store listing | 80-char limit |
| Icon | Main store listing (512×512) — **uploaded separately from the build** | new SmartMenu mark |
| Feature graphic | Main store listing (1024×500) | should be re-cut for the new brand |
| Package name | **Do not touch** (`com.webnegosyo.admin`) | unchanged |

Apple reviews the App Name change like any other metadata change; a name that no longer
matches the screenshots is a common metadata rejection, so refresh any screenshot that
shows the old wordmark (the sign-in screen does).

---

## What actually changed (engineering summary)

### Rebrand

- `app.config.ts` → `name: "SmartMenu"`. `slug`, `scheme`, `bundleIdentifier` and
  `android.package` deliberately unchanged — the bundle id is the App Store app's
  identity and the package is the Play listing's identity, so changing either starts a
  brand-new listing and abandons every install, rating and review.
- Icon set regenerated from the SM + cloche mark cropped out of
  `public/landing/smartmenu-logo.png` (the wordmark, tagline and "by WebNegosyo" line
  are dropped — they are illegible at home-screen size). `icon.png` is opaque, as the
  App Store requires.
- Android adaptive background moved `#111111` → `#FFFFFF` and the splash background
  `#F2F2F7` → `#FFFFFF`; the new mark sits on white, and the old plates put a black ring
  and a visible square edge around it.
- In-app copy: sign-in title, camera-permission explainer, photo-permission string, SMS
  permission error, campaign-due notification, superadmin overview subtitle, and the
  store-request screen.
- Deliberately **not** renamed: `lib/demo.ts` `tenantName: "WebNegosyo Coffee (Demo)"` —
  that is a real tenant's name (slug `webnegosyo-coffee`), and changing the label here
  alone would desync the app from the record. Rename the tenant first if you want it to
  read SmartMenu Coffee.

### Receipt formats

- Block-based layout engine with Classic / Compact / Detailed presets. Classic is pinned
  byte-for-byte against the previous output, so existing merchants see no change until
  they choose otherwise.
- `tenants.receipt_layout` carries the store's saved layout into the app's print path.
- The engine is mirrored into `src/lib` so the web editor preview and web printing render
  from the same code as the thermal printer.

### Receipt tracking QR

- Pure-JS QR → BMP builder feeding the thermal `printImageBase64` raster path, plus
  QR-aware receipt segments and the tracking-URL fetch.

### Delivery on the Register

- Manual delivery fee, address and phone on the POS money path, with UI entry, a totals
  row, and the fee actually sent with the sale.
- The delivery address is promoted out of the customer-data blob into the platform
  `delivery_address` column, and emitted top-level on POS orders for column parity.
- A delivery fee can be attached or corrected on an already-placed order; `deliveryFee`
  now persists on Convex order revisions (schema v21).
- Fix: the tender total is recomputed when the sale's delivery details change.

### Internal / not in the public notes

- Loyverse webhook registration ordering, deferred and capped image mirroring, and the
  live-update status readout in the superadmin tenant form — server and superadmin side.

---

## Before you submit

1. **Version number — verify, don't assume.** `app.config.ts` still says `1.0.4`. Apple
   closes a version train on *approval*, so if 1.0.4 was approved, no build number will
   reopen it and this release must be 1.0.5. Check
   `GET /v1/apps/6761642956/appStoreVersions` before bumping — the file's own comment
   block records this having bitten builds 28–35.
2. **Did 1.0.4 actually reach users?** If it never shipped, add a bullet for the iOS
   Bluetooth printer discovery fix (`95427f7`) to the "What's New" — otherwise that fix
   lands with no note at all.
3. **`webnegosyo-app/ios/` is stale.** It is gitignored, so EAS regenerates it from
   `app.config.ts`, but the local folder still contains `WebNegosyo.xcodeproj`. Delete it
   before any local build, or you will build the old-named binary.
4. **Guideline 3.1.1 risk.** The sign-in screen links to "Create your store"
   (`app/(auth)/login.tsx:196` → `app/(auth)/signup.tsx`). Build 18 was rejected under
   3.1.1 for exactly this, and the round-3 fix removed it. It is back. Decide whether it
   goes out again before submitting.
5. **Convex v22 fan-out and the EAS Update** for the receipt work are still pending per
   the receipt-formats notes; the hardware QR print is unverified on a real printer.
6. **Screenshots** showing the old WebNegosyo wordmark need re-shooting for both stores.
