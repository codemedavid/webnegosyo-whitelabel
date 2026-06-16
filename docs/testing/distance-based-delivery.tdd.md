# TDD Evidence — Distance-Based Delivery Fee

**Source plan:** `/ecc:plan` output in this session (distance-based delivery fee, non-Lalamove path). Journeys derived from the approved plan + the four `AskUserQuestion` decisions.

## Decisions locked (from the user)

- **Minimum amount** = minimum delivery fee **floor**: `fee = max(min_fee, distance_km × per_km)`.
- **Formula** = per-km only with floor (no separate base fee).
- **Out of range** = **block** delivery (address beyond `radius_km` cannot be ordered for delivery).
- **Config location** = **both** superadmin tenant form and merchant admin settings.
- **Distance** = straight-line **Haversine** (no external API), Lalamove always takes precedence when enabled.

## User journeys

1. As a merchant, I configure my store location + radius + per-km + minimum fee, so delivery is auto-priced without Lalamove.
2. As a customer, when I pick a delivery address, I see the fee auto-calculated from distance, floored at the minimum.
3. As a customer, when my address is outside the radius, delivery is blocked with a clear message.
4. As the platform, the fee is recomputed server-side and out-of-range orders are rejected, so the client cannot underpay or bypass the radius.
5. As the platform, when Lalamove is enabled, its rate is used and distance-based pricing is ignored.

## RED → GREEN evidence (pure core, `src/lib/delivery-fee.ts`)

| Stage | Command | Result |
|---|---|---|
| RED | `npx jest --testPathPatterns="delivery-fee"` | `Cannot find module '@/lib/delivery-fee'` — suite failed to run (implementation absent). |
| GREEN | `npx jest --testPathPatterns="delivery-fee"` | **23 passed, 23 total.** |

The RED was a compile-time failure caused by the intended missing implementation (the new test referenced a not-yet-created module), per the TDD skill's compile-time-RED path. Production code was written only after RED was observed.

## Test specification (guarantees)

| # | What is guaranteed | Test (file: case) | Type | Result |
|---|--------------------|-------------------|------|--------|
| 1 | Identical points → 0 km; one degree latitude ≈ 111.19 km | `tests/unit/delivery-fee.test.ts:haversineDistanceKm` | unit | PASS |
| 2 | Longitude shrinks with latitude (cos factor); symmetric; handles negative coords | `…:haversineDistanceKm` | unit | PASS |
| 3 | Config resolves only when enabled + radius>0 + perKm≥0 + minFee≥0; rejects NaN/Infinity; allows flat fee (perKm 0) | `…:resolveDistanceDeliveryConfig` | unit | PASS |
| 4 | Fee floor applied for nearby distances; distance×perKm above floor; rounded to 2 decimals | `…:calculateDistanceDeliveryFee` | unit | PASS |
| 5 | Radius boundary: `== radius` is in range, just-over is out of range; fee still computed when out of range | `…:calculateDistanceDeliveryFee` | unit | PASS |
| 6 | End-to-end quote from two coordinates; out-of-radius flagged | `…:quoteDistanceDelivery` | unit | PASS |

## Integration verification (non-unit)

| Check | Command | Result |
|---|---|---|
| Whole project typechecks | `npx tsc --noEmit` | 0 errors |
| Full test suite still green | `npx jest` | 61 suites, **898 tests** passed |
| Lint on all changed files | `npx eslint <changed files>` | 0 errors / 0 warnings |

## Files changed

- **New:** `supabase/migrations/20260617000000_distance_based_delivery.sql`, `src/lib/delivery-fee.ts`, `src/app/actions/delivery.ts`, `src/components/admin/delivery-settings-form.tsx`, `tests/unit/delivery-fee.test.ts`, this report.
- **Edited:** `src/types/database.ts` (Tenant interface), `src/lib/tenants-service.ts` (Zod schema + insert/update payloads), `src/app/actions/orders.ts` (server-side authoritative recompute + out-of-range rejection, both Convex & Supabase paths), `src/hooks/useCheckout.ts` (Lalamove-vs-distance branch, out-of-range state + submit guard), `src/components/customer/checkout-templates/checkout-primitives.tsx` (out-of-range message + distance hint), `src/components/superadmin/tenant-form-wrapper.tsx` (DistanceDeliverySection), `src/components/superadmin/tenant-form.tsx` (legacy/dead form — required-field fix only), `src/actions/tenants.ts` (`updateTenantDeliveryForAdminAction`), `src/app/[tenant]/admin/settings/page.tsx` (renders the merchant form).

## Adversarial review (multi-agent) — findings & resolutions

A 3-lens review (correctness / security / consistency) with per-finding verification raised 10, confirmed 7. All 7 were fixed and re-verified (tsc 0 / 910 tests / lint clean):

| Sev | Finding | Resolution |
|---|---|---|
| MED | Superadmin `createTenantAction`/`updateTenantAction` (`src/actions/tenants.ts`) built their own payloads and **silently dropped** the 4 new columns — superadmin saves didn't persist delivery config | Added `DeliveryFeeColumns` intersection + threaded the 4 fields into both payloads |
| MED/HIGH | Editing the address as free text left **stale `delivery_lat/lng`**; the text-only stale guard passed and the server recomputed on stale coords | `checkout-primitives.tsx` + `classic-checkout.tsx` now **delete** `delivery_lat/lng` when no fresh geocode → client effect + server `Number.isFinite` both fall into the safe "no coordinates" branch |
| MED | Enabling distance delivery with blank pricing **failed open** (no fee, no radius block) | `.superRefine` on both `deliveryUpdateSchema` (merchant) and `tenantSchema` (superadmin) requires pricing + store location when enabled; merchant action uses `safeParse` → clean error |
| LOW | `delivery.ts` used `select('*')` (pulled secret `lalamove_*` keys on a public endpoint) | Restricted to the 7 non-secret pricing columns |
| LOW | Non-delivery order types on distance tenants passed the client fee through | `effectiveDeliveryFee = undefined` for non-delivery order types |
| LOW | Dead `tenant-form.tsx` partially patched | Left a comment that delivery config is intentionally handled by `TenantFormWrapper` + the merchant action (file not deleted — not created by this change) |

**Residual (documented, not a regression):** the server prices from client-supplied coordinates, so a client bypassing the UI could send coordinates that don't match the address text. The stale-coords fix closes the realistic/accidental vector; fully closing the deliberate vector requires **server-side geocoding** of the address at order time (Mapbox/Nominatim) — a deferred enhancement, same trust model as the existing Lalamove path.

## Known gaps / follow-ups

- Distance is straight-line (Haversine), which under-counts real road distance; merchants tune `per_km`/`min_fee` accordingly. Real driving distance via Mapbox Directions is a possible future enhancement (adds API cost/latency).
- `tests/unit/delivery-fee.test.ts` covers the pure pricing core (the security-critical math). The server action, the `useCheckout` branch, and the forms are verified via typecheck + the full existing suite + an adversarial multi-agent review of the diff; no new component/integration tests were added for the UI wiring.
- The migration must be applied to the database (`supabase db push` / MCP `apply_migration`) before the feature is live.

## Note on checkpoints

The TDD skill recommends a git checkpoint commit per RED/GREEN stage. This repo's workflow rule is "commit only when the user asks," so no commits were made; the RED/GREEN evidence is preserved in this report instead.
