# Merchant app — Team directory + staff profiles (2026-09-19)

## Problem
`app/(main)/team.tsx` was one 656-line screen: a roster of expandable rows where
each account's permissions, branch, pinned screen and password reset lived
inside the list. Scrolling past four colleagues meant scrolling past forty
switches. Nothing on it answered the question an owner opens it with — who is
on the counter right now, and what did they do today — and the analytics panel
beneath it rendered sales, order activity and shift history as three stacks of
bare `<Text>` rows.

## Decisions
- Same shape as the web rebuild (`staff-management-profiles.tdd.md`): the roster
  IS the report, and each card opens that person's own screen.
- The person's screen is three views, not one long scroll — Activity / Shifts /
  Access — because they are three different questions and only one is being
  asked at a time. Access is last: the question that brings an owner here almost
  never ends in a permission change.
- Adding someone is a sheet, not a block that unfolds inside the list: the form
  asks eight questions and the keyboard used to lose the owner's place.
- Permission switches still save on flip. On a phone, a form you must remember
  to submit is a form whose changes get lost when you are called to the counter.
- The old panel's counter-sales analysis survives as a ranked leaderboard behind
  the `analytics` grant; its order-activity and shift-history text dumps were
  deleted — the directory and the profiles answer those properly now.

## Red → Green
| Test | Guards |
|---|---|
| `lib/staff-format.test.ts` | Today/Yesterday, relative last-active with a date ceiling, Manila clock independent of device TZ, initials incl. emails |
| `lib/staff-activity/shift-summary.test.ts` | verdict via `reconcileShift` (open/uncounted/balanced/short/over), turnover = cash collected, duration incl. open shifts, totals |
| `lib/staff-activity/staff-directory.test.ts` | rows for people with no activity, on-shift sorting, former staff, team stats, Manila day grouping |
| `components/staff/StaffCard.test.tsx` | figures, on-shift state, tap-through, "(you)", empty grant list, no-shift dash |
| `components/staff/ShiftHistoryList.test.tsx` | verdict + turnover + times, uncounted ≠ balanced, open drawer, branch name, empty state |
| `components/staff/DayHistoryList.test.tsx` | per-day totals, shift chips, act labels, truncation, empty state |
| `components/staff/StaffAccessPanel.test.tsx` | whole-list permission writes, refusal to empty an account, full-access flip, branch gating, password floor, screen offers, busy guard |
| `components/staff/AddStaffSheet.test.tsx` | submit completeness, password floor, pinned screen dropped with its permission, branch question gating |

Guardrails updated rather than worked around: `lib/screen-primitives.test.ts`
lost `team.tsx` from both ratchet lists (the screen is now built from the shared
primitives), and `team-screen-mount.test.ts` / `staff-tenant-scope.test.ts` now
assert the transport rules on `lib/manage-staff-client.ts`, which both staff
screens share, plus new mount rules for the profile route.

## Structure
- `lib/staff-format.ts`, `lib/staff-activity/shift-summary.ts`,
  `lib/staff-activity/staff-directory.ts` — pure, mirroring the web modules
- `lib/manage-staff-client.ts` — the one bounded transport both screens build from
- `components/staff/` — StaffAvatar, StaffStatStrip, StaffCard, ShiftHistoryList,
  DayHistoryList, StaffAccessPanel, AddStaffSheet, StaffSalesLeaderboard
- `app/(main)/team.tsx` rewritten; `app/(main)/staff/[userId].tsx` new
  (registered `href: null`); `components/StaffPerformancePanel.tsx` deleted

## Verification
- `npx tsc --noEmit` clean; full app suite green (370 suites / 4619 tests).
- Repo `npm run lint` unchanged at the pre-existing 26-error floor, none in touched files.

## Not done
- Not run on a device or simulator, and not exercised against real data:
  `order_status_events` is applied in prod but empty, and `staff_shifts` holds
  one row, so every panel was checked against fixtures and empty states.
- Ships only with an OTA update or an EAS build.
- `components/tutorial/scenes/TeamScene.tsx` is a separate simulated screen; it
  still draws the old roster layout and now teaches a UI that has moved.
