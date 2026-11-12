# Customer app: launch without PayMongo (screenshot proof + Semaphore on the web admin)

Status: APPROVED by the owner 2026-11-13. Pilot store: **beracah-cafe**.

Owner, 2026-11-13: the first store app launches WITHOUT PayMongo (P6 moves after the pilot).
Customers pay with the store's own methods (GCash, bank, cash) and attach a **screenshot**.
Semaphore (the paid SMS service that texts sign-in codes when the store has no sending phone)
must be configurable from the **web admin**, not only the merchant app.

Before either is built: the integration branch `integration/customer-app-2026-11-13`
(local main + origin/main + the customer app stack) must pass the full QA sweep. Both features
build on that branch.

## A. Payment screenshot in the app

Today the app only takes a typed reference number for a method marked "Require payment proof"
(`paymentReference` in `src/lib/app-contract/orders.ts`). The web takes a screenshot OR a reference.

- **Upload**: the app posts the photo to the EXISTING `POST /api/payment-proof/upload`
  (bytes-checked JPEG/PNG/WEBP, 5 MB, server-chosen folder + random name, per-IP limit, returns
  `{ url, fileId, deleteToken }`). No new upload route, no new ImageKit key path.
- **Order**: the app contract gains `paymentProofImage: { url, fileId } | null` beside
  `paymentReference`. The server passes both through the SAME `sanitizePaymentProof` the web uses
  (ImageKit host + folder only), so a forged URL is dropped exactly as on the web.
- **Rule** (same as web `getPaymentProofError` + `proofForMethod`): a proof method needs a
  screenshot OR a reference; a method without proof sends neither.
- **App UI**: payment section shows "Add screenshot" (photo library via `expo-image-picker`,
  shrunk on the phone to ≤1600 px JPEG so it stays under Vercel's 4.5 MB body limit), a
  thumbnail with Remove, and the reference field under "or type the reference number".
  Upload starts when the photo is picked; Place order waits for it.
- **Merchant side**: nothing new. The order already shows the proof the web would have sent
  (order screens, receipts, merchant app).
- `expo-image-picker` is a native module: it works in Expo Go now and in the EAS builds later.

Proof: contract parity test; engine test that an app order with a forged URL is stored without
it; simulator run on sample-demo (pick screenshot → order → proof visible in admin order + DB
row read).

## B. Semaphore on the web admin

The server side already exists: `POST /api/loyalty/sms-settings` (`status` / `save_fallback` /
`clear_fallback`), owner-only for the key, key verified against Semaphore before it is stored in
`tenant_secrets`, never returned. Only the merchant app has a screen for it (`SmsFallbackCard`).
Sign-in codes for the customer app already use it (`loadOtpRouting`: store phone first, else the
store's Semaphore, else "can't text codes").

- New web card **"Text messages (SMS)"**: sending phone online/offline, "Semaphore backup:
  on (sender NAME) / off", paste API key + optional sender name, Save (checks the key with
  Semaphore first), Remove. Same wording as the app card where it fits.
- Where: Settings → a new "Text messages" section, owner (and staff managers) only, store-wide
  accounts. It says what the key is used for: customer app sign-in codes, reward codes, rewards
  page codes. Added to `ADMIN_SECTION_PERMISSIONS` (guardrail test).
- Same route, same rules: the web calls it with the signed-in session's bearer token, as
  `loyalty-wallet-verification-setting.tsx` already does. No new server code beyond the page.
- The loyalty page keeps its wallet-verification switch; it links to the new card.

Proof: component test (status, save, refused key, remove); browser run on sample-demo with a
throwaway invalid key (refused, nothing stored) — a REAL key is only entered by the owner.

## Decisions (owner, 2026-11-13)

1. **Whose Semaphore account?** Each store pastes its OWN key (the store pays for its texts), as
   the code does today. No WebNegosyo platform key for now.
2. Plan approved as written. First pilot store: beracah-cafe.
