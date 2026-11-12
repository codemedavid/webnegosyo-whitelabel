# Customer app — Phase 5: loyalty + member QR (plan)

Status: **APPROVED 2026-11-12** — counter-only claims (checkout rewards = later P5b), QR at once (no second SMS code), live test on sample-demo OK. Main merged in first.

**Built 2026-11-12.** Migration `20261111223138_customer_app_loyalty.sql` APPLIED to platform (two parts: `…223138` + `…223149_customer_app_loyalty_claim`) and probed (column, CHECK, FK cascade, index, anon/authenticated refused, service role answers). PGlite `tests/sql/run-customer-app-loyalty.cjs` passes (incl. an app claim redeemed by the real `issue_loyalty_pos_quote`). Live `CUSTOMER_APP_LOYALTY_LIVE=1` passed on sample-demo (ran twice: 2 `live-test` corrections, both rewards voided). Owed: web deploy, device run, Retry-After not surfaced in the app.
Date: 2026-11-11. Branch `feat/customer-app`.

Goal: a signed-in customer opens Rewards and sees their real stamps/points,
unlocked rewards and history; Scan shows a member QR the register already
knows how to read; "Use now" on a reward shows a 2-minute claim QR the cashier
scans to redeem it. A customer who has collected stamps on the web storefront
sees them the moment they sign in (same `phone:+639…` key, nothing to merge).

Works for every store whatever its order backend: loyalty tables live on
platform Supabase for all stores (Convex orders earn through projections).

## 1. What exists (reuse, don't rebuild)

| Piece | Today | Use in P5 |
|---|---|---|
| Wallet read | `lookup_loyalty_wallet` RPC (`/api/loyalty/wallet`): programs + open rewards, IP + phone rate events (10/min per IP) | Same projection, but session-bound and without the IP limiter (phones behind carrier NAT share IPs; the app refetches on focus) |
| Member QR | `loyalty_wallet_passes` serial per (program, customer), `WNLC1.<serial>`; POS `/api/loyalty/passes/identify` → phone | `ensurePass` on the store's first live program → `memberCode`. One QR earns on every program (identify returns the phone) |
| Reward claim | SMS code → `verify_loyalty_claim` → row in `loyalty_verified_claims` (token hash, 2 min) → POS `issue_loyalty_pos_quote` reserves by token hash | App mints the same claim row from the signed-in session — no second text |
| Activity | `loyalty_activity` view + `readLoyaltyActivity(customerKey)` | First 30 events for the customer, mapped to the app's kinds |
| App contract | `src/lib/app-contract/loyalty.ts` (`memberCode`, programs, rewards, activity) | Add claim shape + `claimsAvailable` + reward ladder |
| App screens | Rewards, Scan, Home member card/teaser, all on fixture data | Swap to the live source; add the claim sheet |

## 2. Database — migration `20261111120000_customer_app_loyalty.sql`

1. **`app_customer_loyalty(p_tenant_id, p_customer_id)`** — SECURITY DEFINER,
   service role only. Key = `phone:` + `customers.phone_e164` (PH mobile only;
   anything else → empty card). Runs `expire_loyalty_reservations`, then the
   SAME program/reward selects as `lookup_loyalty_wallet` (copied verbatim;
   the existing RPC is not touched). Returns `{ok, programs, rewards}`, or
   empty lists when loyalty is off/shadow.
2. **`loyalty_verified_claims`**: `challenge_id` becomes nullable, new
   `app_session_id uuid references customer_app_sessions(id) on delete cascade`,
   CHECK exactly one of the two is set. Only two readers exist
   (`issue_loyalty_pos_quote`, `quote-issuer.ts`) and both use `token_hash` /
   `entitlement_id` only — proved in the SQL test, not assumed.
3. **`issue_app_loyalty_claim(p_tenant_id, p_session_token_hash, p_entitlement_id, p_claim_token_hash)`**
   — SECURITY DEFINER, service role only. Session live, not revoked, same
   store; loyalty live; same lock order as verify/settlement (balance →
   entitlement); reward belongs to THIS customer, `issued|restored`, not
   expired. Limit: 6 claims per session per 10 min (own small events table).
   Inserts the claim (2 min, capped by the reward's expiry). One generic
   refusal for every failure.

## 3. Web API (`/api/app/v1`, via `appRoute`, Bearer `cs1.` session)

- **`GET me/loyalty`** → `AppLoyalty`: `memberCode` (null when the store has no
  live program), programs (+ optional `rewardSteps` ladder), rewards (+ emoji,
  free-item photo), first 30 activity events, `claimsAvailable` (same env
  gates as the web claim: `LOYALTY_PUBLIC_CLAIMS_ENABLED` +
  `LOYALTY_POS_SETTLEMENT_ENABLED`; the SMS flag is not needed). Rate limit
  60/min per session. Signed out → 401 like `/me`.
- **`POST me/loyalty/claims {rewardId}`** → `{token, expiresAt}`. Token made by
  the existing `createClaim` (only its hash stored). Never logged.
- Contract changes in `src/lib/app-contract/loyalty.ts`, copied to
  `customer-app/src/lib/contract/` (parity test as today).

## 4. App (`customer-app/`)

- Live source gets `getLoyalty` + `claimReward`; fixture stays for Expo Go demo.
- **Reward card**: "Use now" (was "Show at counter" → member QR, which can't
  redeem) opens a claim sheet: big QR on white, max brightness, countdown,
  "Get a new code" after expiry. While open it re-reads `me/loyalty` every 5 s;
  when the reward leaves the list → "Scanned ✓" and the sheet closes.
  `claimsAvailable = false` → "Ask the cashier" text instead of the button.
- **Scan tab**: real `memberCode`; no live program → current "join" empty state.
- **Home** member card + rewards teaser read the same query.
- Refetch on tab focus and after an order reaches done/completed.
- App checkout keeps the reward toggle hidden (server refuses `rewardId` today).

## 5. Tests and proof

- **PGlite runner** (`tests/sql/`, real migration, `platform-auth.cjs`):
  anon/authenticated refused on both RPCs; own reward → claim; another
  customer's / expired / reserved / consumed reward refused; revoked or other
  store's session refused; loyalty shadow refused; rate limit; **an app claim
  token is accepted by the real `issue_loyalty_pos_quote` and marked used**;
  the SMS path (`verify_loyalty_claim`) still inserts with `challenge_id`;
  `app_customer_loyalty` returns exactly what `lookup_loyalty_wallet` returns
  for the same key.
- Route tests (401, generic refusals, no token in logs), contract parity, app
  tests (claim sheet states, scanned detection, live source mapping).
- **Live** (opt-in `CUSTOMER_APP_LOYALTY_LIVE=1`) on **sample-demo** (platform,
  loyalty live, the designated test store): throwaway `+63999…` customer +
  session, one stamp correction via the existing RPC, read `me/loyalty`,
  confirm `memberCode` resolves through `identify`, mint a claim and let it
  expire. Ledger rows are append-only, so the correction stays, noted
  `live-test`.
- Migration applied to platform + probed (columns, CHECK, functions, grants),
  then types regenerated. App on the simulator against `localhost`.

## 6. Decisions for you

1. **Reward at app checkout** — P5 is counter-only (claim QR). Using a reward on
   an online order is new everywhere (the web checkout can't either): hold on
   place, consume on fulfilled, give back on cancel. Recommend a later P5b.
2. **No second text code to use a reward** — the signed-in session already
   proved the number by SMS, so "Use now" shows the QR at once (Starbucks
   style). Recommend yes.
3. **Live test on sample-demo** writes one stamp correction for a throwaway
   number that stays in its loyalty history. OK?

## 7. Not in P5

Points + stamps on one wallet card, games, per-person vouchers (rewards-tokens
plan); "Add to Apple/Google Wallet" inside the app; push when a stamp lands (P7).
