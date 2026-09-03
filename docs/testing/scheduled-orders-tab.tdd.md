# TDD Evidence — Scheduled Orders in the Merchant App

**Source plan**: inline `/plan` output in-session (2026-08-29); journeys derived there, no `.plan.md` artifact.

## User journeys

1. As a merchant taking pre-orders, I want a Scheduled tab showing upcoming orders by requested time, so a Saturday catering order is never buried in the recency-sorted queue.
2. As a merchant who never enabled advance ordering, I must never see that tab.
3. As kitchen/counter staff, I want a reminder to fire at lead time before a pre-order is due, so I start prepping without watching a screen.
4. As anyone reading the order queue, I want a pre-order to name its requested moment and stop going red from mere ticket age.

## Task report

| Phase | RED evidence | GREEN evidence |
|---|---|---|
| 1 — agenda tab | `npx jest --selectProjects logic` (webnegosyo-app): 4 suites failed — missing `lib/scheduled-orders`, `lib/advance-ordering`, `app/(main)/scheduled.tsx`, unmapped tab (commit `test: scheduled-orders agenda logic + tab mount guardrails (RED)`) | `npx jest --selectProjects logic`: **213/213 suites, 3032 tests**; `npx tsc --noEmit` clean; web `staff-permissions` parity 2/2 (commit `feat: scheduled-orders agenda tab…`) |
| 2 — chip, urgency, reminders | `npx jest lib/scheduled-reminders… components/OrderCard.test.tsx`: missing module, missing `getScheduleAwareUrgency` export, chip not found in render (commit `test: pre-order reminders, scheduled chip… (RED)`) | full app run `npx jest`: **221/221 suites, 3123 tests**; `tsc --noEmit` clean (commit `feat: pre-order reminders + scheduled chip…`) |
| 3 — web scheduledFor gate | `npm run test -- --testPathPatterns=convex-scheduled-for-arg`: 6/6 failed on missing helper + wiring (commit `test: gate top-level scheduledFor… (RED)`) | full web run `npm run test`: **537/537 suites, 6343 passed / 8 skipped** (commit `fix: send top-level scheduledFor to Convex…`) |

## What the passing tests guarantee

| # | Guarantee | Test | Type |
|---|---|---|---|
| 1 | Schedule ISO read prefers the column, falls back to `customerData.scheduled_for`; label prefers the customer-captured `scheduled_for_label` | `webnegosyo-app/lib/scheduled-orders.test.ts` | unit |
| 2 | Agenda keeps only active statuses with valid schedules, soonest first; date strip folds missed days into Today and always offers Today; Tomorrow labeled as such | same | unit |
| 3 | Overdue / due-soon (≤60 min, configurable) / upcoming banding | same | unit |
| 4 | Tab registered in Operations, has a route file, sits behind `show("scheduled")` AND `useAdvanceOrdering`, and is explicitly mapped to the `orders` grant (pos-only cashier excluded; owners/legacy-null included) | `webnegosyo-app/lib/scheduled-orders-screen-mount.test.ts` | source guardrail |
| 5 | Screen uses shared logic (`selectScheduledOrders`/`buildDateStrip`/`groupByTime`), backend-routed `orders:getOrders`, branch scoping, WorkspaceSwitcher, and the shared order detail | same | source guardrail |
| 6 | `hasAdvanceOrdering` is strict `=== true`; absent/null columns read as off | `webnegosyo-app/lib/advance-ordering.test.ts` | unit |
| 7 | Reminder planner keys on order+requested instant, fires at `scheduledAt − lead` clamped to now, dedupes known keys, cancels completed/edited occurrences, ignores ASAP/terminal orders | `webnegosyo-app/lib/scheduled-reminders.test.ts` | unit |
| 8 | `GlobalOrderAlerts` calls `syncScheduledOrderReminders` behind `shouldAlertOnNewOrders` (demo never schedules) | same | source guardrail |
| 9 | OrderCard shows `Scheduled · <label>` (label preferred, ISO formatted otherwise), no chip on ASAP | `webnegosyo-app/components/OrderCard.test.tsx` | component |
| 10 | Pre-order urgency keys off the requested moment (calm while booked, warning inside the window, urgent past it); ASAP unchanged | `webnegosyo-app/lib/order-visuals.test.ts` | unit |
| 11 | Web→Convex checkout sends top-level `scheduledFor` only to schema v9+ deployments; pre-v9/unknown omit it (customerData copy always rides) — a stale tenant can never reject a checkout | `tests/unit/convex-scheduled-for-arg.test.ts` | unit + source guardrail |
| 12 | Staff with only the `orders` grant see Operations as dashboard/orders/scheduled | `webnegosyo-app/lib/staff-permissions.test.ts` (updated expectation) | unit |

## Coverage and known gaps

- The reminder **adapter** (`lib/scheduled-reminder-alerts.ts`) imports expo-notifications/AsyncStorage and is untested by design, matching `lib/sms/due-alerts.ts` — all decisions live in the tested planner.
- `useAdvanceOrdering` (supabase read + session cache) is untested for the same native-import reason; its predicate is.
- Reminders fire only on devices that observed the order while open (local notifications); server-push via Convex scheduler is a listed follow-up.
- Agenda reads `getOrders` limit 300 client-filtered; a dedicated indexed query is deferred until volume demands it.
- Tab badge count deferred.

## Merge evidence

Checkpoints are real commits on `main` (RED test → GREEN feat per phase, 6 commits). If squashed, this file is the surviving record.
