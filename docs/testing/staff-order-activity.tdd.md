# Staff order activity — TDD record (2026-09-19)

## Problem
No surface recorded who confirmed, cancelled or completed an order. Web `updateOrderStatus`, the app's `orders:updateOrderStatus` and the Convex mutation all took `{orderId, status}` only. Shifts existed (app Drawer, `staff_shifts`) but could only report counter cash.

## Decisions (with the user)
- Activity view on BOTH web admin and app.
- Web orders a cashier confirms count as activity only; drawer cash stays counter-sales-only.
- No open-shift gate; attribution by actor + time window.

## Red → Green
| Test | Guards |
|---|---|
| `tests/unit/staff-activity-order-event.test.ts` | dedupe rule, classification, per-person summary, actor drill-down selection |
| `tests/unit/staff-activity-record.test.ts` | name snapshot from `app_users`, redundant skip, best-effort swallow |
| `tests/unit/staff-activity-request.test.ts` | POS activity body parsing; actor never from body |
| `tests/unit/staff-activity-period.test.ts` | period key fallback + window |
| `tests/unit/staff-activity-report.test.tsx` | summary table, drill-down, truncation notice |
| `tests/unit/order-status-events-migration.test.ts` | corpus replay: append-only trigger, SELECT-only policies, shared branch predicate |
| `webnegosyo-app/lib/staff-activity/activity.test.ts` | app mirror of summary rules |
| `webnegosyo-app/lib/staff-activity/report-pos-sale.test.ts` | POS sale payload + transport |

## Writers
- `src/lib/orders-service.ts` → `recordWebStatusEvent`
- `src/app/api/customers/sync-order-lifecycle/route.ts` → event before ledger sync
- `src/app/api/staff/order-activity/route.ts` (new) ← `webnegosyo-app/lib/staff-activity/report-pos-sale.ts`

## Readers
- `src/app/[tenant]/admin/staff/page.tsx` + `src/components/admin/staff/staff-activity-report.tsx`
- `webnegosyo-app/components/ShiftCard.tsx`, `StaffPerformancePanel.tsx`

## Verification
- Web: tsc 0 errors, eslint clean on touched files, targeted suites green.
- App: tsc 0 errors, eslint clean, shift suites green.

## Not done
- Migration `20260919120000_order_status_events.sql` not applied.
- App changes unshipped (OTA/EAS).
- Convex-store status events carry no order total (mutation args lack it).
