# Staff management — directory + profiles (2026-09-19)

## Problem
`/admin/staff` was two stacked cards that never referred to each other: the
settings roster (names, permissions, dialogs) above a flat activity table
(`?staff=<id>` drill-down). Nobody could get from "Ana" to "Ana's Tuesday"
without reading both, shifts were three lines of text inside the drill-down,
and there was no page that answered "who is on the counter right now".

## Decisions
- The roster IS the report: one card per person carrying their own figures.
- A person gets a real page — `/admin/staff/[userId]` — holding their day-by-day
  history, every drawer they held, and the controls that change their account.
- Management moves below the record on that page: the question that brings an
  owner here almost never ends in a permission change.
- Former staff keep a card (behind a "Past staff" toggle) and a page. Deleting
  an account must not rewrite last month's takings.
- The owner is one of the people, but never occupies a plan seat.
- Days are Manila days (`toBusinessDayKey`), the boundary the DB already numbers
  orders by.

## Red → Green
| Test | Guards |
|---|---|
| `tests/unit/staff-shift-summary.test.ts` | verdict (open/uncounted/balanced/short/over), turnover = cash collected not the drawer, duration incl. open shifts, centavo drift, totals |
| `tests/unit/staff-profile.test.ts` | directory rows for people with no activity, on-shift sorting, former staff, owner, team stats, Manila day grouping |
| `tests/unit/staff-format.test.ts` | Today/Yesterday, relative last-active with a date ceiling, initials incl. emails, Manila clock independent of reader TZ |
| `tests/unit/staff-directory.test.tsx` | profile links, on-shift badge, search, past-staff toggle, seat count excluding the owner, empty states |
| `tests/unit/staff-profile-panels.test.tsx` | shift verdicts/turnover/branch, uncounted ≠ balanced, day totals, truncation notice, empty states |

## Structure
- `src/lib/staff-activity/shift-summary.ts` — drawer arithmetic (mirrors the app's `reconcileShift`)
- `src/lib/staff-activity/staff-profile.ts` — directory entries, team stats, day grouping
- `src/lib/staff-activity/staff-format.ts` — day labels, last-active, initials, Manila clock
- `src/lib/outlets/branch-label.ts` — moved out of `staff-fields.tsx`: a plain function exported
  from a `'use client'` module becomes a client reference and throws when a Server Component calls it
- `src/components/admin/staff/` — avatar, stat strip, period tabs, directory, add dialog (extracted
  from `staff-roster.tsx`, one add form for every surface), profile header, shift history, day history, access card

## Verification
- `npx tsc --noEmit` clean; `npm run lint` unchanged at the pre-existing 26-error floor, none in touched files.
- Full Jest suite green (770 suites / 8367 tests).
- `npm run build` compiles both routes (`/[tenant]/admin/staff`, `/[tenant]/admin/staff/[userId]`).

## Not done
- Not exercised against a live store: `order_status_events` is applied in prod but still empty
  (no deployed writer has fired), and there is exactly one `staff_shifts` row, so every panel was
  verified against fixtures and empty states rather than real traffic.
- `staff-activity-report.tsx` and its test were deleted; their guarantees moved into the new suites.
