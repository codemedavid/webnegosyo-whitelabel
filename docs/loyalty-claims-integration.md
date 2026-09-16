# Loyalty OTP integration contract

Development status: reward setup, customer wallet/claims, POS reservation/settlement, destination projection, and refund reconciliation are implemented locally. The public and merchant redemption flows remain gated pending staging, device, concurrency, and backend-outage validation. No deployment or release enablement is implied.

## Deployment configuration

| Setting | Scope | Required value / purpose |
| --- | --- | --- |
| `LOYALTY_HASH_KEY` | Web server secret | Independently generated 32 random bytes, base64 or base64url encoded; hashes OTPs, phones, IPs and signs claims. |
| `LOYALTY_ENCRYPTION_KEY` | Web server secret | A different independently generated 32-byte key, base64 or base64url encoded; encrypts SMS outbox payloads. |
| `LOYALTY_SMS_DELIVERY_ENABLED` | Web server | Exactly `true` enables device and delivery routes. Keep unset until the delivery pilot is validated. |
| `EXPO_PUBLIC_LOYALTY_SMS_DELIVERY_ENABLED` | Merchant app build | Exactly `true` sets the app's `extra.loyaltySmsDeliveryEnabled`. Native SecureStore support requires an EAS build. |
| `LOYALTY_PUBLIC_CLAIMS_ENABLED` | Web server | Exactly `true` enables the public request and verification routes, provided delivery, keys and ingress are also configured. Keep unset pending rollout validation. |
| `LOYALTY_PUBLIC_TRUSTED_INGRESS` | Web server | Currently only `vercel` is supported, with Vercel's `VERCEL=1` runtime setting. Assert this only for deployments reached exclusively through the reviewed Vercel ingress. |
| `EXPO_PUBLIC_LOYALTY_POS_SETTLEMENT_ENABLED` | Merchant app build | Exactly `true` exposes the POS reward scanner and tender flow; it does not bypass server authorization. |
| `CRON_SECRET` | Web server secret | Authenticates the maintenance schedule with `Authorization: Bearer <secret>`. |
| `LOYALTY_POS_SETTLEMENT_ENABLED` | Web server | Enables new quotes and settlements. Keep unset until deployment validation; exact receipt recovery and syncing continue when it is off. |

Provision separate secrets per environment through the deployment secret manager. Generate each key independently with a cryptographic random generator; never use a password, UUID, sample value, or the same key twice. Do not prefix keys with `NEXT_PUBLIC_`/`EXPO_PUBLIC_`, put them in app config, or send them to devices. Preserve the active pair while any challenge, encrypted job or claim can still be used: the version-1 crypto envelope has no key ring. Drain or invalidate outstanding work before a deliberate rotation. Device credential hashes are independent of these keys.

Apply the loyalty migrations in timestamp order through the usual staging/deployment process, including `20260910130000_loyalty_verification_limits.sql` and `20260910140000_loyalty_sms_ack_authorization.sql`. The latter lets completion/recovery distinguish revoked device access (HTTP 403) from a still-valid device whose lease/outcome acknowledgment was refused (`applied: false`). No migrations, secrets, flags or deployments were applied by this continuation.

The ingress adapter accepts only one valid `x-vercel-forwarded-for` IP and refuses missing, chained, scoped or port-qualified values. It never falls back to client-provided `x-forwarded-for`, `x-real-ip`, Cloudflare headers, or a body IP. Vercel documents the provider header in its [request-header reference](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for). Self-hosted origins need a separately reviewed adapter and network restriction; setting a provider environment variable does not authenticate arbitrary direct traffic. Upstream proxies may concentrate customers into one rate-limit identity. Validate the actual ingress before rollout.

## Public endpoints

Both endpoints require `Content-Type: application/json`, accept at most 16,384 streamed bytes, reject unknown fields, normalize UUIDs and Philippine mobile phones, and return `Cache-Control: no-store`. They do not require customer accounts. No hashes, customer identity keys, authoritative reward terms or prices may be supplied by clients.

`POST /api/loyalty/claims/request`

```json
{ "tenantId": "<tenant UUID>", "entitlementId": "<reward UUID>", "phone": "<PH mobile>" }
```

Every well-formed attempt returns HTTP 202 with:

```json
{ "accepted": true, "challengeId": "<opaque UUID>", "expiresInSeconds": 300 }
```

This confirms receipt of the request, not reward eligibility or SMS delivery. The server returns a random decoy challenge reference when issuance is refused, throttled or cannot be confirmed. The same shape prevents those outcomes from revealing phone/reward membership. Only an eligible request creates a real five-minute challenge and encrypted Android SIM job. Delivery has no automatic paid fallback. The client should say: “If this reward is available for your number, you’ll receive a code.”

Issuance retains the existing durable quotas: tenant/phone 60-second cooldown, 3 attempts per 15 minutes and 10 per day; global IP 30 per 15 minutes and 100 per day; tenant 60 per minute and 1,000 per hour. The internal issuer retries storage once with identical arguments to avoid duplicate SMS jobs. Repeating the HTTP request is a new issuance attempt and consumes the applicable budget.

`POST /api/loyalty/claims/verify`

```json
{ "tenantId": "<tenant UUID>", "challengeId": "<challenge UUID>", "phone": "<PH mobile>", "code": "<six digits>" }
```

Confirmed verification returns HTTP 200 with `{ "token": "<signed opaque claim>", "expiresAt": "<server timestamp>" }`. The customer wallet displays this as the POS reward QR when all three server release gates are enabled. Never put the token or code in URLs, analytics or logs. The token contains no phone/profile/reward fields; signature validity alone does not authorize redemption. SQL still must consume its stored reference atomically during reservation.

Durable verification quotas run before challenge verification, counting unknown tenants/challenges and identity mismatches: tenant/phone 10 per 15 minutes and 30 per day; global IP 30 per 15 minutes and 100 per day; tenant 120 per minute and 2,000 per hour. The existing five-attempt challenge limit remains authoritative. Limiter and verification run in separate transactions so a verification failure cannot erase the abuse event. Neither call is automatically retried.

Invalid, expired, exhausted, replayed and rate-limited verification returns the same HTTP 400 error. Unconfirmed database outcomes return HTTP 503 with an instruction to request a new code. **Recovery of a claim token after a lost HTTP response remains unfinished.** The original successful verification cannot be replayed to retrieve it, and retrying a wrong code may consume another attempt. Clients must not automatically resubmit verification; request another code after the resend cooldown. A retry must never create a POS sale through the legacy tender path.

All well-formed issuance and verification outcomes have the same 350 ms response floor plus independent 0–100 ms jitter. This reduces fast-path timing differences; database waits/outages can exceed the floor. This is not a constant-time guarantee or an edge flood defense. Staging timing checks, edge rate controls and request-log redaction are required before public enablement.

## Local verification

Focused web tests run without a live database:

```sh
npx jest --config jest.config.cjs --runInBand tests/unit/loyalty tests/unit/api/loyalty-public-claims.test.ts tests/unit/api/loyalty-settlement.test.ts tests/unit/api/loyalty-sms-devices.test.ts tests/unit/api/loyalty-sms-delivery.test.ts
```

`tests/sql/run-loyalty-verification-limits.cjs` runs the actual limiter migration in isolated PGlite; use an external `@electric-sql/pglite` installation via `NODE_PATH`, as with the other loyalty SQL runners. These tests do not prove real multi-session PostgreSQL contention, deployed ingress behavior, handset SMS delivery or staging readiness.


## Wallet, merchant setup, and redemption

`POST /api/loyalty/wallet` accepts `{ tenantId, phone }` and returns only `{ programs, rewards, claimsAvailable }`. It requires the private keys and trusted ingress even for progress-only lookup. SQL limits lookup to 10/IP/minute, 200/IP/day, 20/tenant-phone/15 minutes, and 120/tenant/minute. Results are bounded to 100 programs and 100 rewards. Lookup never creates a customer or authorizes redemption.

Web management is at `/{tenant}/admin/loyalty`; mobile management is the Rewards screen. A selected free item must belong to that tenant and be available, with no substitution. Rules revisions send `expectedVersion` and create immutable versions; a missing version can be repaired using `null`. Schedule dates use Manila midnight; the end date is exclusive. Scope and earning mode are set at creation. Reward/rules edits preserve already-issued entitlements.

`POST /api/loyalty/quotes` accepts `{ tenantId, requestId, claimToken, outletId, orderTypeId, cart: { lines: [{ menuItemId, quantity, selectedOptionIds }] } }`. It resolves the signed claim, prices catalog data on the server, and atomically reserves the reward with the quote. It accepts no caller prices, entitlement terms, or payment policy. Retry the same request ID and cart after uncertainty. `DELETE /api/loyalty/quotes` accepts `{ tenantId, quoteId }`; cancellation is serialized even if the first quote response was lost. It remains available with new redemption disabled.

`POST /api/loyalty/settlements` accepts `{ tenantId, quoteId, clientOrderId, tender: { methodId, amountTenderedCentavos, reference? } }`. Cash change is server-calculated. Manual methods require an exact amount and payment reference; uploaded-proof methods are unavailable. The app journals the reservation before preview, then the exact ID and tender before payment settlement. Until cancellation or a confirmed receipt, normal checkout cannot reuse that basket through the legacy creator. Never clear an uncertain sale's journal or collect payment again to recover it. Already-committed receipts can be recovered after quote expiry or after disabling the new-settlement gate.

Supported carts are merchandise-only, without tracked inventory, stock-tracked/linked/negative modifiers, delivery, service charges, order-type price overrides/markup, presell, bundles, notes, or voucher/manual-discount stacking. Free-item rewards waive one base unit; extras remain payable. These unsupported adapters must be implemented before expanding the rollout boundary.

## Deployment and operation

Apply prerequisite migrations followed by the eight `20260914` loyalty migrations in timestamp order (16:10 management through 17:20 settlement earning snapshot). Update Convex deployments to schema v31 and tenant Supabase deployments to v3 using the included regenerated bundles. No destination schemas or production migrations were applied during development.

The checked-in schedule invokes `GET /api/loyalty/maintenance` every minute with `CRON_SECRET` bearer authentication. Each call releases at most 250 expired holds, prunes bounded retention batches, processes up to three sale projections, and checks up to five completed receipts for refunds. New-settlement flags do not stop committed receipts from syncing. Refund checks rotate through unreconciled completed receipts, with at least one hour between checks of the same sale; recovery latency increases with queue size and outages.

A destination sale, its items, and paid state commit together, deduplicated by canonical settlement ID. After customer capture/earning succeeds, the job completes. Eight failed projection attempts move a job to `failed`. Web program management shows up to 50 oldest pending/claimed/failed jobs and a Retry sync action. `GET /api/loyalty/projections?tenantId=…` lists safe job metadata; `POST /api/loyalty/projections` with `{ tenantId, jobId }` reschedules only a failed job and records the actor/time. Both require `loyalty_manage`. Fix missing schema/credentials/backend configuration before rescheduling; do not create another POS order manually.

Full-refund restoration reads the destination payment ledger and reverses earning before returning the entitlement. Partial refunds do not restore it; expired rewards remain expired. Refund records are idempotent by canonical settlement, including after the reward has been used again. Positive-value refunds on tenant Supabase installations without a payment ledger remain unconfirmed. The original canonical receipt is immutable, and the restoration has a separate audit record.

Monitor maintenance outcomes (`projections`, `refunds`), persistent failed jobs, receipt-to-order latency, and device/SMS queue health during staging and pilot use. Canonical reward sales freeze earning program versions at settlement; older general order-event processing still needs its separate historical-version and lifecycle audit. Backend changes while work is queued fail closed and require operator reconciliation against the original destination.
