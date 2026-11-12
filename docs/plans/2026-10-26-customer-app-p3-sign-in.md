# Customer app — Phase 3: phone sign-in (plan)

Goal: a customer signs in to ONE store's app with their PH mobile number and a
6-digit text code; the app holds an opaque session; `/me` reads/edits/deletes the
profile. Existing stamps (keyed `phone:+639…`) belong to the number, so they
appear the moment the customer signs in (Phase 5 shows them).

## Reuse, don't rebuild (research: loyalty OTP path)

The loyalty module already sends one-time codes for reward claims and the
wallet check, through the store's **own Android phone** (free) and, when no
phone is online, the store's **own Semaphore account** (store pays). Codes are
HMAC-hashed, the SMS payload is AES-GCM-encrypted, and the phone renders
whatever text the server sends — so **no merchant-app release is needed**.

Reused as is: `createLoyaltyClaimCrypto` / `loadLoyaltyClaimCrypto`,
`getLoyaltyTrustedIp`, `loadOtpRouting` + `dispatchOtpViaSemaphore`,
`loyalty_sms_outbox` + its claim/authorize/finish RPCs, the shared verify
budget `allow_loyalty_verification_attempt`, `paced()` decoy timing.

## Changes

**Migration `customer_app_auth`** (service role only):
- `loyalty_otp_challenges.purpose` gains `'login'` (+ `login_has_no_reward`).
- `customer_login_issuance_events` — login's own rate table (doesn't eat the
  reward-code cooldown). Limits: per number 1/60s, 3/15 min, 10/day; per IP
  30/15 min; per store 20/min, 300/hour, **daily cap** before any paid send.
- `issue_customer_login_challenge(...)` — copy of the wallet issuer without
  the "must already be a member" check; cancels open login codes for the number.
- `verify_customer_login_challenge(...)` — checks the code (5 tries, 5 min),
  upserts `customers` (tenant, phone; `created_source = 'app'`, new allowed
  value), creates the session row, returns customer + whether it is new.
- `customer_app_sessions(tenant_id, customer_id, token_hash unique,
  created_at, last_used_at, expires_at (sliding 60 d), absolute_expires_at
  (1 y), revoked_at)`.
- **Phone gate**: today the store phone may only pick up codes when loyalty is
  live. Login codes get their own rule (store has an enrolled phone, the
  `customers` key), so a store without a stamp card can still sign customers
  in. Touches ~5 delivery RPCs + `sms-delivery-http.ts`; reward/wallet rules
  unchanged.
- SMS wording per purpose: "123456 is your <Store> sign-in code. It expires in
  5 minutes. Don't share it." (both senders).

**Routes** (`/api/app/v1`, via the existing `appRoute`):
- `POST auth/otp/request {phone}` → always 202 `{challengeId, expiresIn}`
  (decoy id on refusal, same timing) — never reveals whether a number is known.
- `POST auth/otp/verify {challengeId, phone, code}` → `{token, isNewCustomer,
  profile}`; one generic error for every failure.
- `DELETE auth/session` → sign out (revoke).
- `GET/PATCH/DELETE me` → profile (name); DELETE = Apple 5.1.1(v) account
  deletion: revokes sessions and removes the app profile; the store's order
  and stamp history stay with the store.
- Session token: 256-bit random, only its hash stored; sent as
  `Authorization: Bearer`; kept in expo-secure-store on the phone.

**App Review**: per store, one allow-listed review number + fixed code, used
only while the app's status is `draft` or in review, every use logged.

**App**: the existing sign-in screens call the real routes; session in
secure-store; checkout/rewards/scan read the signed-in state; sign out and
delete account call the server.

## Tests

PGlite runner over the real migration (anon/authenticated refused, issue →
verify → session, expiry, 5 tries, replay, rate limits, decoys, purpose
isolation from claim/wallet), route tests (decoy parity, generic errors,
session sliding/absolute expiry, revoke), app tests (secure-store session,
401 → signed out). Live: request a code to a real test number on beracah-cafe.

## Needs from you

1. Who pays for texts when the store's phone is offline (below).
2. A real PH number I may text for the live test.
