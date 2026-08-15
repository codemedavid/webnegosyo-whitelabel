# TDD evidence — admin toggle for scan-to-collect pickup

**Source plan:** produced inline in the same session (`/ecc:plan "Allow admin to
toggle on and off scan to collect the pickup"`); not written to a `*.plan.md`
file. Builds on `docs/testing/scan-to-confirm-pickup.tdd.md`.

**Date:** 2026-08-15 · **Branch:** `main` · **Commits:** `8b00fee` (RED),
`f84ccc6` (GREEN)

## User journeys

1. As a merchant admin, I want to turn scan-to-collect off, so that my staff go
   back to handing pickup orders over without a scan.
2. As a merchant admin, I want turning it off to take effect on orders already
   in the kitchen, so that customers are not shown a code nobody will scan.
3. As a staff member, I want a scanned code to be refused at a store that turned
   the feature off, so that a screenshot taken while it was on cannot be used.
4. As a customer, I want the tracking page and its 10-second polling to agree,
   so that the code does not flicker in and out.

## Task report

### 1. Store switch outranks the order's own state (web)

Added `isPickupScanEnabled` and an `isScanEnabled` input to
`shouldShowPickupQr`. The new input is **required**, so every call site had to
state its answer rather than inherit a default.

- RED: `npx jest tests/unit/pickup-qr-gating.test.ts` → `4 failed, 11 passed`
  (`TypeError: isPickupScanEnabled is not a function`, plus the disabled-store
  case returning `true`).
- GREEN: same command → `15 passed`.
- Guarantees: a disabled store hides the QR at `pending`/`confirmed`/
  `preparing`/`ready`; `undefined`/`null` read as enabled.

### 2. The flag reaches both surfaces (web)

`TrackingData.pickupScanEnabled` is populated in `fetchOrderTrackingData`, which
feeds both the SSR page and the polling API route, so they cannot disagree.

Read via a separate `fetchPickupScanEnabled` helper rather than by adding the
column to the tenant-config `select`. Naming a column that a deployment has not
migrated fails the *whole* query, and that query is what decides whether the
order is found at all — the same failure that once 404'd every storefront
(`storefront-select-migration-drift`). Isolated here, the worst case falls back
to `true`, the column's own default.

- Validation: `npx tsc --noEmit | grep -c "^src/"` → `0`.

### 3. A genuine ticket is refused at a disabled store (merchant app)

`evaluatePickupTicket` gained a `scan_disabled` block reason, checked
immediately after the tenant check and before anything is said about the order.
This is the enforcement point — the hidden QR is not, because a code printed
while the feature was on still decodes.

- RED: `(webnegosyo-app) npx jest lib/pickup` → 2 suites failed to compile,
  `TS2353: 'scanEnabled' does not exist in type Pick<VerifiedPickupOrder,
  "status">`. Compile-time RED: the tests newly reference the field the fix
  introduces.
- GREEN: same command → `33 passed`.
- Guarantees: `scanEnabled: false` blocks with `scan_disabled`; `undefined`
  confirms as before; a foreign ticket still reports `wrong_tenant` first;
  a non-boolean `pickupScanEnabled` in the payload is ignored, not coerced.

### 4. Admin control

`updatePickupScanAction` behind `verifyTenantAdmin`, and `PickupScanCard` in
Settings under the existing `hasSettingsAccess` gate. Saves on toggle and snaps
back on failure, so the switch always shows what the store is actually doing.

- Validation: `npm run lint` → no findings in any changed file (88 pre-existing
  errors elsewhere, chiefly `webnegosyo-desktop` bundled output).

### 5. Schema

`supabase/migrations/20260820120000_pickup_scan_toggle.sql`, **applied** to the
platform DB via Supabase MCP and probed:

```
column_name          | data_type | is_nullable | column_default
pickup_scan_enabled  | boolean   | NO          | true
```

`src/types/supabase.ts` regenerated from the DB (not hand-patched, per
`generated-supabase-types-drift`). The diff is +12 lines: this column plus
`created_source`, `notes`, and `minimum_order_amount`, which had already drifted.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A disabled store shows no QR at any live status | `tests/unit/pickup-qr-gating.test.ts:hides the QR at every live status when the store turned scanning off` | unit | PASS |
| 2 | An absent setting reads as enabled, not disabled | `tests/unit/pickup-qr-gating.test.ts:treats a missing value as on` | unit | PASS |
| 3 | Existing visibility rules are unchanged when enabled | `tests/unit/pickup-qr-gating.test.ts` (6 cases) | unit | PASS |
| 4 | A genuine ticket is blocked at a disabled store | `webnegosyo-app/lib/pickup/guards.test.ts:blocks a ticket when the store has turned scan-to-collect off` | unit | PASS |
| 5 | A foreign ticket reveals nothing about the issuing store | `webnegosyo-app/lib/pickup/guards.test.ts:checks the store before the scan setting` | unit | PASS |
| 6 | An absent setting still confirms pickups | `webnegosyo-app/lib/pickup/guards.test.ts:treats an absent scan setting as enabled` | unit | PASS |
| 7 | The setting is carried off the tracking payload | `webnegosyo-app/lib/pickup/verify.test.ts:carries the store's scan setting through` | unit | PASS |
| 8 | A non-boolean setting is ignored rather than coerced | `webnegosyo-app/lib/pickup/verify.test.ts:ignores a non-boolean scan setting` | unit | PASS |

## Coverage

```
src/lib/pickup-qr-gating.ts        100 stmts / 100 branch / 100 funcs / 100 lines
webnegosyo-app/lib/pickup/*.ts    94.64 stmts / 82.60 branch / 85.71 funcs / 95.91 lines
  guards.ts                        100 / 100 / 100 / 100
```

Full suites: web `5638 passed, 1 failed`; app `2673 passed, 1 failed`. Both
failures are pre-existing and unrelated:

- `tests/unit/vouchers/engine-parity.test.ts` — web↔app voucher summary mirror
  drift, no voucher file was touched here.
- `webnegosyo-app/components/pos/DiscountSheet.test.tsx` — passes in isolation
  (`npx jest components/pos/DiscountSheet.test.tsx` → 23 passed); a full-suite
  parallelism flake.

## Known gaps

- **Not proven end to end.** Like the feature it gates, this has never run on a
  handset against a real order. The underlying flow was already unproven.
- **Old app builds do not enforce.** They ignore `pickupScanEnabled` and will
  still confirm a scan. The customer-side QR disappears immediately on any web
  deploy; full enforcement needs an app release.
- **No test covers the card or the server action.** Both are thin: a `Switch`
  wired to `updatePickupScanAction`, and an `update` behind `verifyTenantAdmin`
  matching `updateOperatingHoursAction`. The decisions worth pinning are pure
  and are covered above.
- **Store-wide, not per-branch.** A `tenants` column. Per-branch would need an
  `outlets` column and scope resolution on every scan.
