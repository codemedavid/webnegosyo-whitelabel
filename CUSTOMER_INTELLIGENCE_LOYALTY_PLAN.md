# Customer Intelligence and Account-Free Loyalty

## Summary

Create a unified Customer Hub for owners and authorized staff, plus a phone-linked loyalty program that requires no customer account. The experience should feel warm and rewarding while remaining fast and safe at the counter.

Success means merchants can quickly understand retention, see what each customer buys, automatically reward qualified orders, and redeem rewards without duplicate credits or exposing customer history.

## Customer and Merchant Flow

- Customer Hub opens on Overview, followed by Directory, Programs, and Campaigns.
- Overview shows the 7/30/90-day repeat-customer rate, previous-period comparison, new versus returning customers, at-risk customers, loyalty participation, and unclaimed rewards.
- Directory rows show lifetime orders/spend, return cadence, favorite item, last visit, and loyalty status. A dedicated profile shows recent orders, top three items, program balances, reward history, notes, and contact information.
- Public `/{tenant}/loyalty` allows phone-only progress lookup. It exposes program progress and rewards only—never order history, spend, address, or full profile data.
- Online orders link automatically by normalized phone. At POS, staff search the phone or scan an opaque membership QR before tender.
- POS settlement or online delivery/collection credits every applicable active program. Scanning only identifies the customer; it never awards credit itself.
- To claim, the customer selects one reward, verifies an SMS code, and receives a two-minute single-use QR. POS scans, validates, reserves, and applies it; completing the sale consumes it atomically.

## Implementation Changes

- Replace the Convex-only customer KPI source with a platform-wide order-facts projection covering platform Supabase, Convex, and tenant Supabase. Extend external facts with status, payment state, branch, completion time, and update time.
- Define repeat-customer rate as: identified customers ordering in the selected period who also have an earlier qualified order, divided by all identified customers ordering in that period. Show identified-order coverage beside the metric.
- Calculate customer cadence from qualified lifetime orders. Rank top items by completed unit quantity, using stable menu-item IDs when available and normalized names for legacy records.
- Add an idempotent order lifecycle sync contract. POS qualifies after settlement; non-POS orders qualify after delivery/collection. Cancels and refunds append compensating entries and trigger aggregate recomputation.
- Add versioned loyalty programs with:
  - `stamp` or `points` earning modes.
  - Business-wide or branch-specific scope.
  - Multiple overlapping programs: earn all eligible programs, redeem one reward per sale.
  - Fixed, percentage, or selected free-item rewards.
  - Optional minimum spend, percentage cap, reward expiry, activation dates, pause, and end states.
  - Exclusive redemption by default: loyalty cannot combine with vouchers or manual discounts.
- Free-item rewards waive one configured base item only; upgrades and add-ons remain payable. Unavailable items cannot be silently substituted.
- Persist programs, immutable versions, customer balances, append-only ledger entries, reward entitlements, reservations/redemptions, OTP challenges, and SMS outbox jobs. Unique program/order keys prevent duplicate earning.
- Existing orders never grant retroactive loyalty credit. Live rule changes create new versions; issued rewards retain their original terms.
- Add these service boundaries:
  - Merchant-authenticated order-facts synchronization.
  - Rate-limited public loyalty lookup and claim request/verification.
  - Merchant scan resolution, reward reservation, and atomic consumption.
  - Android OTP job claim/completion for native-SIM delivery.
  - Owner program management and auditable balance corrections.
- OTP transport defaults to an online authorized Android merchant device. Tenants may instead select [Semaphore’s documented OTP endpoint](https://api.semaphore.co/docs); there is no automatic paid fallback in v1.
- Codes expire after five minutes with resend, attempt, phone, tenant, and IP limits. Store keyed hashes only; QR payloads contain signed opaque references rather than PII.
- Keep the existing `customers` permission for customer history. Add `loyalty_manage` and `loyalty_redeem`; POS-only staff can attach customers without gaining access to full profiles.

## Test and Rollout Plan

- Unit-test identity normalization, repeat-rate windows, anonymous-order exclusion, cadence, top-item ranking, program qualification, threshold carry-over, versioning, and reward calculations.
- Test concurrent/replayed lifecycle events, multiple-program earning, reversals, negative corrected balances, reservation expiry, full-refund entitlement restoration, partial refunds, and free-item pricing.
- Test OTP rate limits, encrypted outbox handling, Android and Semaphore adapters, incorrect/expired codes, tampered/reused QR tokens, tenant isolation, wrong branches, and permission boundaries.
- Add React Native tests for Customer Hub states, profile detail, setup wizard, POS attachment, reward preview, scanning, and manual fallbacks.
- Run end-to-end scenarios for online earning, POS membership scanning, offline sync recovery, native-SIM OTP, optional Semaphore OTP, redemption, cancellation, and cross-branch restrictions.
- Roll out behind tenant flags:
  1. Cross-backend customer facts and Customer Hub.
  2. Loyalty setup with shadow earning and reconciliation checks.
  3. Full Android-SIM pilot for selected tenants.
  4. Optional Semaphore transport, monitored expansion, then general availability.
- Monitor sync latency/failures, data coverage, duplicate-credit attempts, OTP queue time, delivery failures, verification conversion, QR expiry, reservation conflicts, reversals, and reward redemption.

## Assumptions

- Philippine phone numbers and Asia/Manila remain the initial market defaults.
- Customers never receive passwords or authentication accounts.
- Phone-only lookup does not create a customer profile and cannot authorize redemption.
- Rewards are redeemable through POS before tender only; all supported order channels may earn.
- An Android merchant app must be active and online for native-SIM OTP delivery.
- A reward-using order may still earn based on its final net merchandise subtotal.
- Current uncommitted work in the analytics and scanner screens must be preserved and re-inspected before implementation.

## Development checkpoint — 2026-09-06

This is an implementation checkpoint, not a completed rollout. Existing uncommitted changes remain in place on `data-layer-overhaul`. No production migrations or tenant flag changes were applied during this work.

### Verified foundations

- Customer Hub overview and versioned program management/shadow earning already exist. The merchant app has separate Customer Hub, Customers/Campaigns, and Loyalty screens.
- Platform POS orders now record a qualification time when paid, even before a delivery status.
- Hub reads include lifetime history for repeat-customer comparisons and paginate both orders and items. Reads are bounded at 100,000 rows per query and disclose truncation. External customer ledgers still omit anonymous orders, so the Hub now explicitly reports that their coverage cannot be measured.
- Hub API enforces the caller's branch and `customers` permission on the server.
- Lifecycle events preserve omitted payment/source fields and the original completion time. Conditional writes retry concurrent changes; database failures surface instead of reporting successful synchronization.
- Refund reversals use the original order's ledger entries, including paused/ended programs, original customer/version, and original shadow state.
- Voiding an unclaimed reward returns its spent threshold before reversing the order's earning. Held rewards are released; consumed rewards retain their cost. Regression tests execute the SQL in an isolated PostgreSQL engine.
- A new access migration prevents direct program mutations from bypassing the management API and prevents POS-only staff from reading loyalty history.

### New migrations to validate and apply through the normal deployment process

- `supabase/migrations/20260906150000_loyalty_reversal_accounting.sql`
- `supabase/migrations/20260906160000_loyalty_access.sql`
- `supabase/migrations/20260906170000_loyalty_pos_settlement.sql`

These depend on the existing loyalty migrations. The SQL runners under `tests/sql/` accept an external `@electric-sql/pglite` installation via `NODE_PATH`; they do not connect to the configured production database. The earning runner tests the earning function with minimal fixtures, and the access runner tests the original loyalty schema plus the access migration. These do not replace staging migration and concurrent multi-session tests.

### Still pending

Checkpoint validation: 137 web feature tests and 43 merchant-app feature tests passed, along with both isolated SQL runners and lint for the changed web implementation. The repository-wide TypeScript check still reports pre-existing errors outside these feature files; this is not a clean full-build claim.

- Unified Overview / Directory / Programs / Campaigns navigation and dedicated customer profiles with cadence, top items, loyalty history, and notes.
- Complete directory aggregates and anonymous external-order facts; authoritative backend lifecycle reads, durable retry/reconciliation, and remaining refund/partial-refund scenarios.
- Audit net merchandise earning against shipping/fees and discounts, stable platform completion timestamps, and historical version selection for delayed events.
- Complete branch/free-item program setup, revision UI, and concurrent program version/status updates.
- Public phone-only loyalty page and rate-limited lookup.
- Opaque membership QR resolution and redemption UI. The separate `loyalty_redeem` key is now registered in web, merchant app, desktop, and staff provisioning.
- Five-minute OTP challenges, encrypted outbox, device claims/completion, Android SIM worker, and optional Semaphore transport.
- Two-minute single-use claim QR, server-priced reward preview, reservations, release/expiry, and atomic settlement consumption.
- End-to-end/device testing, staging migrations, shadow reconciliation, and tenant pilot rollout/monitoring.

### Approved settlement architecture

The current POS creates an order and marks its payment paid in separate calls. Loyalty lives in the platform database, while an order may live in Convex or a tenant's own Supabase. A post-sale lifecycle notification cannot atomically consume a reward with that external sale.

The user approved platform-authoritative receipts for reward-using POS sales. One platform transaction consumes the entitlement and records the settlement plus an outbox job; an idempotent worker then projects the sale into the external backend. External order visibility becomes eventual. No further architecture approval is needed for this approach.

The new settlement migration implements server-only quote storage, canonical receipts, atomic reward/receipt/outbox writes, exact-retry idempotency, and worker leases with expiry, bounded failure retries, and rejection of stale acknowledgements. Settlement checks tenant, cashier, branch, live loyalty mode, reservation ownership, and reward expiry. The new SQL runner tests rollback, retries, authorization, expiry, and lease recovery in isolation; real multi-session concurrency and staging deployment are still required.

This database core is not yet reachable from the POS UI. It must not be enabled before its trusted quote and tender-validation services exist. A quote snapshot is a server-priced contract, never an accepted client price.

### Next implementation slice

1. Build authenticated quote/reservation endpoints that reload catalog prices and validate customer, branch, reward terms, availability, and discount exclusivity. Freeze the payable amount and permitted payment method/evidence requirements.
2. Add the settlement endpoint that validates tender evidence and invokes `settle_loyalty_pos_sale`; it accepts a quote reference and stable client order ID, not an authoritative client total.
3. Implement each projection adapter and a scheduled worker using the new claim/completion RPCs. Destination writes must be atomic and idempotent by canonical settlement ID, including paid status; a lost acknowledgement cannot create a second sale. Add retries, failure visibility, and reconciliation.
4. Connect verified OTP claims and reward preview to POS tender. Display the canonical receipt immediately while external projection is pending; do not create another order through the old tender path.

The existing best-effort lifecycle hook remains unsuitable for consuming rewards. Do not connect the new settlement core through that hook.

## Development checkpoint — 2026-09-08

### Pricing and settlement boundary implemented (not enabled)

- `src/lib/loyalty/quote-pricing.ts` prices a strict cart of item IDs, quantities, and selected option IDs against **already server-loaded, tenant-scoped, branch-resolved** catalog rows. It does not load or authorize catalog data itself. Names, base prices, modifiers, discounts, and totals come from server data; persisted reward terms are runtime-validated. Existing modifier normalization, effective menu prices, loyalty reward valuation, and order totals are reused.
- Free-item rewards waive one base unit across the whole cart; extras and remaining units stay payable. Required/maximum selections, duplicate options, unavailable options, simple-stock demand across repeated lines, and bounded centavo arithmetic are checked. This is a price preview, not an inventory reservation.
- Supported pricing is merchandise-only, one reward, no additional discounts. Presell, bundles, linked modifiers, selected recipe-stock options, negative price modifiers, shipping/service fees, and voucher/manual-discount stacking are explicitly unsupported at this boundary. Limits: 100 lines, 999 units per line, 1,000 selected option IDs per line, total at most 999,999,999 centavos. Unsupported flows must not silently fall through to discounted settlement.
- `src/lib/loyalty/tender.ts` validates cash or manual tender against a frozen payment policy. Cash must cover the quote; change is server-calculated. Manual tender must match exactly and include a reference when required. A manual reference is **cashier attestation**, not uploaded payment proof or provider verification. Methods requiring those stronger checks must remain unavailable until their evidence adapters exist.
- `POST /api/loyalty/settlements` accepts only `{ tenantId, quoteId, clientOrderId, tender }`. It authenticates merchant membership and both `pos` / `loyalty_redeem` grants, loads only that cashier's tenant-scoped quote, checks its frozen payment policy against its stored total, and invokes the existing atomic RPC. It does not accept authoritative client prices, actor identity, or payment status. Responses are non-cacheable; input is byte-bounded; internal database errors are not exposed.
- Stable client order IDs must be 1–128 characters, starting alphanumeric and otherwise containing alphanumerics, `.`, `_`, `:`, or `-`. A lost response must retry the **same ID and tender**, never create another order through the old POS path. SQL remains authoritative for branch/live-mode/reservation checks and original receipt recovery after quote expiry.
- Required frozen snapshot field: `order_snapshot.paymentPolicy = { totalCentavos, allowedMethods: [{ id, kind: 'cash' | 'manual', requiresReference }] }`. Its total must equal `loyalty_pos_quotes.total_centavos`. Legacy quotes without a valid policy are refused.
- New migration `supabase/migrations/20260907120000_loyalty_quote_immutability.sql` prevents quote UPDATE, DELETE, and TRUNCATE so the terms cannot change between HTTP validation and SQL settlement. Repricing requires a new quote ID. Future privileged archival must preserve receipt recovery; ordinary service callers cannot delete expired quotes.

The route is disabled unless the server-only deployment variable `LOYALTY_POS_SETTLEMENT_ENABLED` is exactly `true`. **Do not enable it yet.** No environment settings, tenant flags, production migrations, deployments, or existing POS flows were changed.

### Next required integration

1. Implement the verified OTP/claim and reservation producer, plus authenticated quote issuance. It must reload authoritative catalog/branch overrides (fail closed on read failures), enforce customer/cashier/branch ownership and live mode, resolve inventory, and freeze a full projectable order snapshot plus supported payment policy. Do not accept arbitrary entitlement IDs or request-supplied catalog/terms as proof of a verified claim.
2. Implement atomic/idempotent destination adapters and the durable projection worker. Existing SQL worker leases are infrastructure only; the worker is not running. Verify inventory and customer-fact/earning projections as well as paid order creation.
3. Connect the POS reward preview/tender to canonical receipts, then test ambiguous commits, real concurrent sessions, expired/replayed claims, cross-branch access, backend outages, and device SMS before enabling the release gate.

The pricing module and settlement endpoint complete only part of the previous "Next implementation slice"; authenticated quote/reservation issuance, catalog loading, OTP, workers, and POS UI are still pending.

Validation for this checkpoint: 238 tests across 13 focused web suites passed (including 116 new pricing/tender/API tests), all three isolated SQL runners passed, and focused ESLint passed. Test-first development and independent review identified aggregate-stock handling, malformed terms, lost-response recovery, UUID normalization, and quote immutability fixes. The final TypeScript check produced no diagnostics for the changed feature files; repository-wide checking still fails on unrelated existing tests. No clean full-build, real concurrent-session, device, or staging-deployment claim is made.

### Follow-up — OTP-to-claim core (2026-09-08, not exposed)

- `src/lib/loyalty/claim-crypto.ts` is explicitly server-only. It generates cryptographically random six-digit codes, tenant/challenge-bound keyed code hashes, tenant-bound phone hashes, and signed opaque random claim references. QR references contain no phone, customer, or reward fields. Signature validation alone does **not** authorize redemption: the database must check the stored claim's expiry and atomically use it during reservation.
- SMS payloads use authenticated AES-256-GCM encryption with tenant/challenge context, random nonces, strict envelope parsing, and generic errors. Decryption is a server operation after device authorization/lease/expiry checks, not an instruction to distribute encryption keys to Android devices. Delivery authorization and workers are not implemented here.
- Supply two independent, securely generated 32-byte server keys to the helper (hash and encryption). No secrets or environment settings were created. Provisioning and rotation remain deployment work; the version-1 envelope has no key-ring recovery, so retain the active keys through outstanding challenge/job/claim lifetimes and deliberately drain or invalidate them before rotation. Never log codes, plaintext SMS payloads, claim tokens, or verification RPC arguments.
- `20260908120000_loyalty_verified_claims.sql` adds a private durable claim table and service-only `verify_loyalty_claim`. Incorrect codes return normally so the attempt count commits; five failed attempts exhaust the challenge. Expired, replayed, overlong, cross-tenant, identity-mismatched, unavailable-reward, disabled, and shadow-mode requests fail closed. Verification and claim insertion commit together; insertion failure leaves the challenge unverified. Claim lifetime starts at actual verification time after lock acquisition.
- The trusted verifier must derive `customerKey`, `phoneHash`, and `codeHash` together using `verificationProof` from the same canonical PH mobile phone and challenge. It supplies these to the RPC as expected customer key, expected phone hash, and candidate code hash, plus the newly generated claim-token hash. The SQL compares the expected identity with the locked entitlement and its keyed phone commitment with the locked challenge. Never accept client-supplied hashes or customer keys as verified proof. Neither challenges nor verified claims duplicate plaintext phone identities; entitlements retain their existing internal customer-key convention.
- Successful verification creates one two-minute claim per challenge, **not** a reward reservation. A repeated verification does not mint another token. If the response is ambiguous, retain the already-generated token; future recovery must resolve that same token or require a fresh challenge. SQL cannot recover plaintext tokens. This core does not yet implement scan resolution, atomic claim use, reservation release, or expiry cleanup.

Next implementation remains the trusted challenge/outbox issuer with atomic resend/phone/tenant/IP limits, gated public request/verify endpoints, authorized SMS delivery, and merchant claim-to-reservation/quote issuance. Do not expose this verification RPC through a public wrapper before those controls exist. Then complete destination projection workers and POS integration as described above. The settlement release gate remains off; no migrations were applied to production.

Validation: 244 tests across 14 focused web suites passed, including six new cryptography/proof tests. The new isolated claim SQL runner and existing earning/access/settlement runners all passed. Focused ESLint and whitespace checks passed; filtered TypeScript output contained no new helper diagnostics (repository-wide checking remains affected by existing unrelated errors). Test-first implementation and independent specification/security review drove the canonical-encoding, phone-privacy, and post-lock expiry checks. Real concurrent-session, public end-to-end, device, and staging tests remain pending.

### Follow-up — trusted challenge issuance and durable limits (2026-09-08)

- `src/lib/loyalty/challenge-issuer.ts` now prepares and submits a server-generated challenge: strict tenant/reward IDs, normalized PH mobile phone, generated code/UUID, paired identity proof, globally keyed IP identity, and authenticated encrypted SMS. Only challenge ID and expiry leave a successful call. Storage failures receive at most one retry with **identical** arguments; malformed responses and preparation errors fail closed without exposing internal details. This is an internal service, not a public route.
- `20260908130000_loyalty_challenge_issuance.sql` atomically creates the five-minute OTP and an `android_sim` outbox job. No SMS is sent by this transaction. There is no automatic Semaphore fallback or paid delivery. Entitlement ownership, status, expiry, and live tenant mode are checked under locks.
- Rate limits are durable and serialized in PostgreSQL, not per-process memory. Pilot defaults: a 60-second tenant/phone resend cooldown; 3 tenant/phone attempts per 15 minutes and 10 per 24 hours; 30 global-IP attempts per 15 minutes and 100 per 24 hours; 60 tenant attempts per minute and 1,000 per hour. Well-formed attempts against unavailable rewards, mismatched identities, and missing/disabled tenants count too. Already-saturated requests do not add more events. No plaintext IP or phone is added to the rate-event table.
- `hashIp` normalizes equivalent IPv6 forms and IPv4-mapped addresses before a tenant-independent keyed hash. The future HTTP adapter **must** get the real client address from the deployment's trusted ingress; never trust an arbitrary body field or forwarded-header chain. These application quotas do not replace edge flood protection or public response/timing anti-enumeration controls.
- Exact retries of the same issuance return the original metadata without another job or rate event, including after expiry. They never extend validity or revive superseded codes. Resends invalidate prior unverified challenges for the same tenant/phone and mark their queued SMS jobs superseded. Already-claimed messages cannot be unsent; their codes are invalidated and the future worker must recheck expiry before delivery. Already-verified claims are not altered.
- Successful issuance timestamps its cooldown at actual issuance after reward-lock waits. Failure to insert the final outbox job rolls back the challenge, supersession, and rate-event writes together. Rate events intentionally survive tenant deletion; a privileged retention job should prune data older than the longest quota window with an operational safety margin. That cleanup is not running yet.

Next: authorized SMS job leasing/completion and native-device integration, then gated public request/verify adapters using trusted ingress and generic responses, plus merchant claim resolution/reservation and authoritative quote issuance. Verification-token recovery after ambiguous responses, device testing, multi-session race tests, retention, backend projection workers, and POS integration are still pending. All deployment flags remain unchanged and live reward settlement remains disabled.

Validation: 261 focused tests across 15 suites passed; this includes 16 issuer tests and seven cryptographic tests. All five isolated SQL runners passed during this continuation (earning, access, settlement, verified claims, issuance). The issuance runner exercises each quota window, global-IP cross-tenant limits, invalid-request budgets, exact retries, resend preservation, role boundaries, and final-write rollback. Focused ESLint and whitespace checks passed; filtered TypeScript checking reported no diagnostics for the new helpers. Independent spec and quality reviews approved the bounded implementation. These are not public end-to-end, real concurrent PostgreSQL, device, staging, or clean repository-wide build results.

## Development checkpoint — 2026-09-09

### Authorized SMS delivery core (not connected or enabled)

- `20260909120000_loyalty_sms_delivery.sql` introduces private registered SMS devices and service-only claim/dispatch/completion RPCs. Every operation requires an enabled device matching tenant, actor, and credential hash, live/non-shadow loyalty, and current merchant `loyalty_manage` access (owner/null-permission and superadmin conventions retained). The existing installation ID is not a credential. Device enrollment, secure credential generation/storage/rotation, and revocation UI/API remain pending; ordinary service callers cannot directly provision this registry.
- Claims return metadata only, with one current job per device and a 30-second lease capped at OTP expiry. Before dispatch, an expired lease may be reclaimed by another authorized device. Each operation locks the challenge before the outbox row to match issuance/supersession. Authorization rechecks OTP eligibility and lease ownership, marks dispatch started atomically, and releases encrypted payload **once**. It cannot be retried to obtain another grant.
- Claim polling filters invalid/expired challenges before considering at most 25 live candidates. If those candidates are locked, `no_job` means poll later, not that the queue is permanently empty. Validity is checked again under row locks. A regression covers more than 25 stale jobs preceding a valid one.
- Once dispatch has started, the job is never automatically reassigned. Completion is idempotent for the same device/actor/token/outcome, including after lease expiry; conflicting outcomes are refused. A native send rejection is treated as uncertain, not proof that no SMS left the handset. Failures store only a generic error. This prioritizes avoiding automatic duplicate sends; it is not an exactly-once carrier-delivery guarantee.
- `src/lib/loyalty/sms-dispatch.ts` decrypts only a validated one-time RPC grant in its tenant/challenge context, checks job/token/expiry, and returns only the device's dispatch fields. It does not retry authorization. The future HTTP wrapper must authenticate the actor, derive credentials server-side, bind the tenant, disable all response caching, and avoid logging codes, phones, tokens, credential hashes, or payloads.
- `webnegosyo-app/lib/loyalty/sms-worker.ts` coordinates one poll at a time. It checks active session and availability, validates lease/grant identity and OTP fields, and leaves a five-second expiry margin. It never retries native sends or authorization; only completion acknowledgements retry, at most twice. Results contain status only. These are callable modules, not a mounted polling loop.
- `sms-transport.ts` reuses the existing Android native and permission interfaces. Permission preparation happens **before** claiming a job; sending never opens a permission prompt. After the final permission check resolves, it rechecks session/expiry immediately before calling the native sender. Tests exercise expiry during that asynchronous check. No handset was contacted or SMS sent during development.

### Remaining delivery integration and recovery

Permanently lost completion after dispatch starts leaves the job claimed and blocks that device from receiving another job. A durable device acknowledgement journal and an explicit reconciliation path are still required; do not solve this by automatically replaying an SMS whose send outcome is unknown. Crashes, logout/credential revocation, device clock skew, foreground transitions, and actual concurrent database sessions need end-to-end/device tests. Expired queue cleanup is also pending.

Next: implement device enrollment and authenticated delivery endpoints, persist non-PII completion acknowledgements on-device, add safe reconciliation, and mount the foreground worker behind the release gate. Then connect public request/verification and merchant claim reservation/quote issuance. Backend sale projection, POS redemption UI, and rollout validation remain unfinished. No production migrations, environment changes, device registrations, or release-flag changes were made.

Validation: 273 web tests across 16 focused suites and 31 mobile tests across three delivery/transport suites passed. All six isolated SQL runners passed, including delivery credentials/permissions/revocation, lease recovery, actual resend invalidation, one-use dispatch, completion retries, and rollback tests. Focused ESLint and whitespace checks passed; filtered web TypeScript output had no new dispatch-helper diagnostics. Test-first implementation and independent reviews strengthened permission timing and bounded queue scanning. These results do not establish real multi-session PostgreSQL behavior, carrier delivery, deployed HTTP integration, or a clean repository-wide build.

## Development checkpoint — 2026-09-10

### Device enrollment, delivery endpoints, and the mounted foreground worker (gated, not enabled)

- `src/lib/loyalty/device-credential.ts` mints a 32-byte url-safe device credential and stores only its domain-prefixed SHA-256 (unkeyed on purpose, so the registry survives loyalty HMAC key rotation). `src/lib/loyalty/server-keys.ts` decodes `LOYALTY_HASH_KEY` and `LOYALTY_ENCRYPTION_KEY` (base64 or base64url, exactly 32 bytes each, must differ) and fails closed to `null`. Neither secret is provisioned anywhere yet.
- `src/lib/loyalty/merchant-http.ts` is the shared bearer-session/membership/body-bounding layer; `src/lib/loyalty/sms-delivery-http.ts` holds the handlers. Routes: `POST`/`DELETE /api/loyalty/sms-devices` (owner or superadmin; the server generates the device UUID and returns the credential exactly once) and `POST /api/loyalty/sms-delivery/{claim|authorize|finish|recover}` (merchant with `loyalty_manage`; the credential is re-presented and hashed on every call). Claim maps `no_job` to `{ job: null }` and `request_denied` to 403 so a revoked handset stops polling; authorize decrypts the one-time grant with the deployment keys and returns dispatch fields only; finish/recover return `{ applied }`. All responses are `no-store`; database messages never leave the boundary. Everything is refused with 503 unless `LOYALTY_SMS_DELIVERY_ENABLED` is exactly `true`. **Do not enable it yet.**
- Merchant app: `lib/loyalty/device-credential-store.ts` keeps `{ deviceId, credential }` in expo-secure-store (new native dependency; needs an EAS build) under a tenant+actor key and discards corrupt values. `lib/loyalty/sms-delivery-api.ts` is the worker's API port with session and request deadlines, strict response parsing, and an `onRevoked` hook (the worker swallows port errors, so revocation must be signalled out-of-band). `lib/loyalty/sms-delivery-mount.ts` is the pure run gate (Android, release flag, live loyalty, not demo, not impersonating, enrolled, app active) and poll cadence (5 s active, 30 s back-off). `lib/loyalty/sms-delivery-runtime.ts` is the only file touching native modules and is called lazily post-render.
- `components/GlobalLoyaltySmsDelivery.tsx` is mounted in the main tab layout beside the auto-print watchers and re-reads the enrollment on every foreground. `components/LoyaltySmsDeviceCard.tsx` on the Loyalty screen lets an owner enroll or remove this phone. Both render nothing unless `extra.loyaltySmsDeliveryEnabled` (from `EXPO_PUBLIC_LOYALTY_SMS_DELIVERY_ENABLED`) is true.

### Still pending

- Provision and document the two loyalty keys and both release flags per environment; then apply the loyalty migrations through the normal process. No environment, flag, migration, or deployment changed in this checkpoint.
- Device and multi-session tests: real handset SMS, revocation mid-lease, logout during a claimed job, clock skew, and the queued-job cleanup/retention job.
- Public phone-only request/verify adapters with trusted ingress, merchant claim-to-reservation and authoritative quote issuance, backend projection workers, and the POS redemption UI, as listed in the 2026-09-08 and 2026-09-09 checkpoints.

Validation: 309 web tests across 18 loyalty suites (75 new: credential, keys, devices route, delivery route including a real encrypt/decrypt grant round-trip) and 80 merchant-app loyalty logic tests (41 new) passed. Focused ESLint and filtered TypeScript checks passed for every changed file in both projects. No clean repository-wide build, real PostgreSQL concurrency, device, or staging claim is made.

### Continuation — public OTP boundary and SMS session fixes (2026-09-10, gated)

- Added `POST /api/loyalty/claims/request` and `POST /api/loyalty/claims/verify`. Both require `LOYALTY_PUBLIC_CLAIMS_ENABLED=true`, the existing server SMS gate, valid independent loyalty keys, and explicit `LOYALTY_PUBLIC_TRUSTED_INGRESS=vercel` with `VERCEL=1`. The ingress adapter accepts one valid provider `x-vercel-forwarded-for` IP and never falls back to client-supplied proxy headers. Self-hosted origins need a separately reviewed ingress adapter. **Do not enable these routes yet.**
- Public input is strict JSON, bounded to 16,384 streamed bytes, with normalized UUIDs/PH mobile numbers and no accepted caller-supplied proofs. All responses are non-cacheable. Issuance returns the same HTTP 202 shape for eligible requests, denials, limits and uncertain storage: `{ accepted: true, challengeId, expiresInSeconds: 300 }`. Refused issuance gets a random decoy reference without creating a challenge, SMS job or customer. This response confirms receipt only; it never confirms phone/reward membership or delivery.
- `claim-verifier.ts` derives canonical paired phone/code proofs, checks durable verification limits, then invokes the existing single-use verification RPC. Only confirmed storage success returns the signed opaque token and original two-minute expiry. Neither limiter nor verification RPC is automatically retried; unknown outcomes fail closed. Expired, incorrect, replayed and rate-limited verification share one error. HTTP claim-token recovery after a lost response remains unfinished; clients must request a new code after the cooldown rather than automatically retry verification.
- New `20260910130000_loyalty_verification_limits.sql` serializes global-IP and tenant quotas at READ COMMITTED. Defaults: global IP 30/15 minutes and 100/day; tenant/phone 10/15 minutes and 30/day; tenant 120/minute and 2,000/hour. Missing tenants/challenges count too. Hash-only events commit separately before verification and survive tenant deletion and downstream failures. Retention/cleanup is still not running.
- Well-formed issuance and verification outcomes share a 350 ms floor with 0–100 ms random jitter. This reduces fast-path timing differences, but does not hide long database waits or replace edge flood protection. Actual ingress, timing and logging controls require staging validation.
- SMS integration now observes scoped enrollment changes immediately, so enrollment starts the foreground worker without an app restart. Old tenant/actor credentials are hidden during scope changes; each worker has its own cancellation state and rechecks current auth/app state before sending. Serialized, conditional credential deletion prevents a late revocation response from erasing a replacement enrollment. SecureStore and SMS native modules load lazily, and enrollment asks for an app update when the native dependency is missing.
- New forward migration `20260910140000_loyalty_sms_ack_authorization.sql` distinguishes invalid device authorization (`device_denied`, HTTP 403) from an ordinary refused lease/outcome acknowledgment (`request_denied`, `{ applied: false }`). Revocation during journal recovery now stops the worker without incorrectly removing healthy devices whose pre-dispatch lease has not expired.
- [Integration contract and deployment configuration](docs/loyalty-claims-integration.md) document endpoint shapes, secrets, flags, ingress assumptions, retry behavior and local verification. No keys were provisioned, migrations applied, flags enabled, SMS sent, or deployments made. Existing unrelated workspace edits were preserved.

Next: implement phone-only lookup/customer UI, recover uncertain enrollment and verification responses, then merchant verified-claim reservation plus authoritative catalog/branch quote issuance. Backend sale projection, POS redemption, cleanup/retention, device tests, real PostgreSQL concurrency and staging/pilot rollout remain pending. Enrollment still generates a new device ID per HTTP attempt; lost enrollment responses can consume the five-device cap and need a deliberate recovery path before pilot enablement.
