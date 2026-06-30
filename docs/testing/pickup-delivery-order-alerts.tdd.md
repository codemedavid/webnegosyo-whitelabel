# TDD Evidence — Pickup/Delivery orders not ringing on the merchant app

**Date:** 2026-06-30
**Source plan:** none — journeys derived during this investigation (bug report: "webnegosyo
app doesn't notify/ring on Android for *pickup/delivery* order types, but QR-handoff works").

## Root cause (diagnosis, not a code regression on `main`)

The notification path does **not** branch pickup/delivery vs QR-handoff in a way that silences
pickup/delivery. The real cause is **Convex deployment lag**:

- The fix that rings *every* order — push fired unconditionally + routed to the high-importance
  Android `"orders"` channel (custom ringtone) — shipped 2026-06-20 in commit `29d16b7` as Convex
  **schema v11** (`src/lib/convex-deploy.ts` `CURRENT_SCHEMA_VERSION = 11`).
- Before v11, `convex/orders.ts` guarded the push with `if (!skipPending)` and `convex/notifications.ts`
  had **no `channelId`**, so a pickup/delivery push landed on Android's default channel → no ringtone.
- Each tenant only receives v11 when its Convex backend is **redeployed**. Verified via Supabase:
  **28 of 33** Convex-enabled tenants are still on a schema `< 11` (v5/v9/v10/v0/null).
- QR-handoff "works" because the merchant **scans on their own device** (immediate accept feedback +
  physical presence) — it never depended on the push arriving.

The source and the prebuilt deploy artifact (`src/lib/convex-push-bundle.json`, regenerated
2026-06-26) are both already correct.

## Fixes

1. **Primary (operational):** run superadmin **Bulk Deploy** (`bulkDeployConvexAction`) to re-push the
   v11 bundle to every tenant with `convex_schema_version` null or `< 11`. No code change.
2. **Secondary (code hardening, this change):** the in-app ringtone host `<OrderAlerts>` was mounted
   **only on the Dashboard screen**, so off-dashboard / other-tab merchants depended entirely on the
   push. Hoisted it to a single `<GlobalOrderAlerts>` host in `(main)/_layout.tsx` so new pending
   (pickup/delivery) orders ring on every tab regardless of Convex version (when foregrounded).

## User journeys

- As a merchant, when a customer places a **pickup/delivery** order, my Android device rings so I
  don't miss it.
- As a merchant on a non-Dashboard tab, a new order still rings (previously it did not).
- As a demo/read-only viewer, I am **never** interrupted by order alerts.
- The **first** load of the order queue must not ring (no false alarm for pre-existing orders).

## Task report

| Behavior | Validation command | RED → GREEN |
|---|---|---|
| Extract pure alert-trigger logic (`selectNewOrders`, `formatOrderAlertBody`) and unit-test it | `npx jest webnegosyo-app/lib/order-alerts-utils.test.ts` | RED: "Cannot find module './order-alerts-utils'" → GREEN: 8/8 pass |
| Refactor `useOrderAlerts` onto the helper (behavior unchanged) | full `npx jest` | 976/976 pass |
| Hoist `<OrderAlerts>` → `<GlobalOrderAlerts>` in `(main)/_layout.tsx`; remove dashboard mount + unused import | `npx tsc --noEmit` (webnegosyo-app) | no type errors |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Initial snapshot (prevIds null) yields no new orders → first load never rings | `order-alerts-utils.test.ts: returns no new orders on the initial snapshot` | unit | PASS |
| 2 | Only unseen order ids count as new | `…: returns only orders whose id was not previously seen` | unit | PASS |
| 3 | No new orders → empty (no ring) | `…: returns an empty array when no genuinely new orders arrived` | unit | PASS |
| 4 | Undefined queue (loading) → no new orders | `…: treats an undefined queue as no new orders` | unit | PASS |
| 5 | First order in a quiet store is detected | `…: detects a brand-new pending order even when the previous set was empty` | unit | PASS |
| 6–8 | Alert body formatting (plural/singular/defaults) | `formatOrderAlertBody` × 3 | unit | PASS |

## Coverage & known gaps

- `webnegosyo-app` has no React Native test harness; the pure helper is tested under the main repo's
  Jest. The React/native pieces of `useOrderAlerts` (audio player, `Notifications`) and the
  `GlobalOrderAlerts` Convex subscription are not unit-tested (would need a jest-expo harness) — they
  are thin wiring over the tested helper and were verified by `tsc`.
- The **primary** fix (bulk redeploy to 28 stale tenants) is operational and must still be performed;
  the code hardening only covers the foreground/in-app case.
