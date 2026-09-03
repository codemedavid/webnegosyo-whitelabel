# TDD Evidence — Schedule tab as a calendar

**Request** (2026-09-03): "we should be able to see the pre-orders on the
webnegosyo-app but more beautifully … just like a google calendar, same with
the scheduled orders."

**Cycle**: RED (logic + two component suites written first, all failing on
`Cannot find module`) → GREEN → refactor. No plan artifact was written; the
design was settled in-session.

## User journeys

1. As a merchant taking pre-orders, I want to see at a glance which days I have
   committed to, so I can plan stock and staff around them.
2. As a merchant, I want pre-sold orders distinguished from ordinary scheduled
   orders, because the pre-sold ones were sold against stock I promised.
3. As a merchant who missed a hand-off, I want it shown on today, not buried on
   a greyed-out yesterday.
4. As a merchant reading the week, I want every upcoming day in one scroll
   without tapping each one.
5. As a screen-reader user, I want every calendar day to say its date and its
   load, and the selected day to say it is selected.

## The decisions the design rests on

- **The month grid is pure arithmetic over the same `selectScheduledOrders`
  list the old strip used.** `lib/schedule-calendar.ts` adds a cursor, a
  Sunday-first grid, per-day load, a kind filter and a day summary; it does not
  re-read orders or re-decide what "scheduled" means. The screen still calls
  `buildDateStrip` / `groupByTime`, so the existing mount guardrail holds.
- **Missed orders fold into today** in the grid exactly as they did on the
  strip (`loadByDay` mirrors `buildDateStrip`), so the overdue dot is always
  on the cell the merchant is already looking at.
- **Padding days stay tappable.** A pre-order on the 2nd of next month is one
  tap away, not a page turn and a tap.
- **The timeline is drawn once** (`DayTimeline`) and used by both the month
  view (one day) and the agenda view (every day), so the two views cannot
  drift.
- **Labels are hand-rolled** (no `toLocaleString`) and every function takes an
  explicit `nowMs`, matching the rest of the schedule code, so the suites are
  deterministic in any CI zone.

## Task report

| Task | Validation | RED evidence | GREEN evidence |
|---|---|---|---|
| Calendar logic (`lib/schedule-calendar.ts`) | `npx jest lib/schedule-calendar` | `Cannot find module './schedule-calendar'` | 14 passed |
| Month grid (`components/schedule/MonthCalendar.tsx`) | `npx jest components/schedule` | `Cannot find module './MonthCalendar'` | 5 passed |
| Day timeline (`components/schedule/DayTimeline.tsx`) | `npx jest components/schedule` | `Cannot find module './DayTimeline'` | 3 passed |
| Screen rewrite (`app/(main)/scheduled.tsx`) | `npx jest lib/scheduled-orders-screen-mount lib/screen-header-mount` | n/a (guardrails pre-existed) | pass |

Two test expectations were corrected during GREEN: the fixed "now" makes
Sep 4 "Tomorrow", so the labels the tests asked for ("Fri, Sep 4") were wrong
and the components were right.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | The cursor starts on the month containing now and shifts across year bounds | `lib/schedule-calendar.test.ts` | PASS |
| 2 | The grid is whole Sunday-first weeks, padded with neighbouring days, four to six rows as the month needs | `lib/schedule-calendar.test.ts` | PASS |
| 3 | Cells flag padding, today and past days | `lib/schedule-calendar.test.ts` | PASS |
| 4 | Per-day load counts orders, pre-sold orders and overdue ones; missed orders fold into today | `lib/schedule-calendar.test.ts` | PASS |
| 5 | The kind filter keeps all / pre-sold only / plain only | `lib/schedule-calendar.test.ts` | PASS |
| 6 | A day summary totals count, pre-sold count and revenue; zero for an empty day | `lib/schedule-calendar.test.ts` | PASS |
| 7 | The agenda lists today first (even empty), then each later day with orders | `lib/schedule-calendar.test.ts` | PASS |
| 8 | "Next loaded day" finds the first day with orders strictly after the given one, or null | `lib/schedule-calendar.test.ts` | PASS |
| 9 | The month is titled in words and paged by named "Previous month" / "Next month" buttons | `components/schedule/MonthCalendar.test.tsx` | PASS |
| 10 | Every day is a button named by its date and load ("Sat, Sep 5, 3 orders, 2 pre-orders"; "Tomorrow, nothing scheduled") and selects on tap | `components/schedule/MonthCalendar.test.tsx` | PASS |
| 11 | The selected day carries `selected: true` for assistive tech | `components/schedule/MonthCalendar.test.tsx` | PASS |
| 12 | "Back to today" appears only once the view has left today | `components/schedule/MonthCalendar.test.tsx` | PASS |
| 13 | The timeline heads the day with its label and totals, marks overdue / due-soon times, and opens each order | `components/schedule/DayTimeline.test.tsx` | PASS |
| 14 | An empty day says so and offers "Next: <day>" only when a later day has orders | `components/schedule/DayTimeline.test.tsx` | PASS |
| 15 | The screen still builds from `selectScheduledOrders` / `buildDateStrip` / `groupByTime`, reads `orders:getOrders` via `useSafeQuery`, scopes by branch, keeps the switcher, and opens the shared order detail | `lib/scheduled-orders-screen-mount.test.ts` | PASS |
| 16 | The screen mounts `ScreenHeader` and hard-codes no top inset | `lib/screen-header-mount.test.ts` | PASS |

## Verification run

```
npx jest            # 246 suites pass; 1 fails (lib/screen-primitives.test.ts,
                    # an untracked guardrail from a concurrent session that
                    # flags 13 OTHER screens; scheduled.tsx is not among them)
npm run lint        # 0 errors, 8 pre-existing warnings in unrelated files
npx tsc --noEmit    # 2 pre-existing errors in payments.tsx / OrderItemsCard.tsx
```

## Deferred

- Week view. The month grid plus a day timeline covers the two questions a
  merchant asks ("which days?" / "what time?"); a week strip would be a third
  way to answer the first.
- Swipe to page months. Buttons are enough for now and are what the tests hold.
- Drag to reschedule. Rescheduling belongs on the order screen, which owns
  the customer conversation.
