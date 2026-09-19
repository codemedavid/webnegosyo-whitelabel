# TDD Evidence — Date-Ranged Reporting

**Branch**: `feat/report-date-range`
**Source plan**: produced inline by `/ecc:plan` in this session (no `*.plan.md` artifact was written; free-form input takes conversational mode).
**Scope confirmed with the user**: single day **and** custom range; merchant app reports only (Analytics, Trends, Orders, exports). Home, POS Sales and web admin were explicitly out of scope.

## User journeys

1. As a merchant, I want to pick **one exact calendar date** so I can see what Sep 3 sold.
2. As a merchant, I want a **custom start–end range** so I can review Sep 1–14 rather than a rolling window ending now.
3. As a merchant, I want **existing presets to keep working unchanged**, including on a store whose Convex deployment is behind the app.
4. As a merchant, I want a picked day to mean **my day** (Manila), not a UTC day that cuts dinner service in half.

## The defect the presets hid

Every analytics query on both backends derived one cutoff from `Date.now()` and read everything after it. That can express "the last N days" and nothing else: asking for the 3rd returned **the 3rd and every day since, labelled as the 3rd** — a wrong figure that still looks authoritative. `orders:getOrders` had no window at all.

## Task report

| # | Task | Validation command | RED | GREEN |
|---|---|---|---|---|
| 1 | Window vocabulary (`lib/report-window.ts`) | `npx jest lib/report-window --selectProjects logic` | compile failure: module absent | 27/27 pass |
| 2 | Bounded windows, platform analytics | `npx jest lib/backends/supabase-analytics --selectProjects logic` | 6 fail / 19 pass | 25/25 pass |
| 3 | Date-windowed `getOrders`, platform | `npx jest lib/backends --selectProjects logic` | 3 fail / 66 pass | 288/288 across 14 suites |
| 4 | Bounded windows, Convex | `npx jest --config jest.config.cjs convex/` | 7 fail / 2 pass | 107/107 across 8 suites |
| 5 | Picker tap state machine | `npx jest lib/report-range-picker --selectProjects logic` | compile failure: module absent | 15/15 pass |
| 6 | Picker sheet component | `npx jest components/ReportRangePicker --selectProjects components` | see note below | 6/6 pass |
| 7 | Shared period bar | `npx jest components/ReportPeriodBar --selectProjects components` | module absent, then 1 fail / 7 pass for the clear affordance | 8/8 pass |
| 8 | Export period heading | `npx jest lib/export --selectProjects logic` | compile failure: `periodLabel` not on the input type | 68/68 pass |

**Note on task 6 — honest RED status.** The component test was written *after* the component, so it had no RED phase. To establish it has power anyway, both disabled guards were mutated out (`disabled={!pending || tooWide}` → `disabled={tooWide}`, `disabled={isFuture}` → `disabled={false}`). The first run of the suite **still passed**, because the pure logic underneath refuses those cases independently — so the tests were provably weak. They were strengthened to assert `accessibilityState.disabled` directly; the same mutation then turned 2 of 6 red, and the restored code passes 6/6. The logic underneath (task 5) did go through a genuine RED.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A picked day covers exactly 24h from Manila midnight (16:00 UTC the day before), not a UTC day | `lib/report-window.test.ts` | unit | PASS |
| 2 | Consecutive days tile without overlap or gap | `lib/report-window.test.ts` | unit | PASS |
| 3 | "Sep 1 to Sep 14" counts 14 days — the 14th's trade is included | `lib/report-window.test.ts` | unit | PASS |
| 4 | A **preset sends `daysBack` alone**, never `startMs` | `lib/report-window.test.ts` | unit | PASS |
| 5 | A future day is pulled back to today rather than shown empty | `lib/report-window.test.ts` | unit | PASS |
| 6 | A reversed range is ordered, not refused | `lib/report-window.test.ts` | unit | PASS |
| 7 | A range wider than 366 days is capped to what the fetch ceiling can honestly serve | `lib/report-window.test.ts` | unit | PASS |
| 8 | A malformed persisted day key yields a sane day, not a thrown screen | `lib/report-window.test.ts` | unit | PASS |
| 9 | Both window bounds reach PostgREST on `orders`, `order_items` **and** `analytics_events` | `lib/backends/supabase-analytics.test.ts` | integration | PASS |
| 10 | A bounded window compares against the equal-length window before it | `lib/backends/supabase-analytics.test.ts` | integration | PASS |
| 11 | Sending only `daysBack` still produces the old rolling window with no upper bound | `lib/backends/supabase-analytics.test.ts` | integration | PASS |
| 12 | A non-finite or inverted window is refused with a message naming epoch milliseconds | `supabase-analytics.test.ts`, `supabase-adapter.test.ts` | integration | PASS |
| 13 | `getOrders` pushes both bounds to the query, not to a post-filter | `lib/backends/supabase-adapter.test.ts` | integration | PASS |
| 14 | `getOrders` with no window still reads the live recent queue | `lib/backends/supabase-adapter.test.ts` | integration | PASS |
| 15 | Convex counts only the picked day, not every day after it | `convex/analyticsWindow.test.ts` | integration | PASS |
| 16 | An order struck at exactly the closing instant belongs to the next day only | `convex/analyticsWindow.test.ts` | integration | PASS |
| 17 | Convex keeps the rolling window when a screen sends only `daysBack` | `convex/analyticsWindow.test.ts` | integration | PASS |
| 18 | Trends, payment, revenue, top-items and upsell reads are all window-bounded | `convex/analyticsWindow.test.ts` | integration | PASS |
| 19 | A range needs two taps; one tap cannot be applied | `lib/report-range-picker.test.ts`, `components/ReportRangePicker.test.tsx` | unit + component | PASS |
| 20 | Switching day↔range keeps the day already tapped | `lib/report-range-picker.test.ts` | unit | PASS |
| 21 | Apply is disabled — visibly, via `accessibilityState` — on a half-built range | `components/ReportRangePicker.test.tsx` | component | PASS |
| 22 | A preset tap is reported as a preset, preserving the stale-backend arm | `components/ReportPeriodBar.test.tsx` | component | PASS |
| 23 | The pill names the picked dates so a merchant can see them without reopening the sheet | `components/ReportPeriodBar.test.tsx` | component | PASS |
| 24 | The way back to the live queue appears only once dates are chosen, and only where a screen asked for one | `components/ReportPeriodBar.test.tsx` | component | PASS |
| 25 | The exported CSV names the picked dates instead of "Last N days" | `lib/export/analytics-export.test.ts` | unit | PASS |

## Defects found and fixed along the way

- **`fetchItems` / `fetchEvents` upper-bound gap** (`supabase-analytics.ts`): both applied only `gte`. Latent while every window was open-ended; a bounded window would have turned it into a silent over-count. Now bounded at both ends, with the item bound on the joined order (an item has no date of its own).
- **Boundary double-count**: `lte` on an exclusive upper end counts an order struck at exactly Manila midnight on both adjacent days. Added `lt` to the `PlatformQueryBuilder` contract and used it for every half-open window.
- **`getSalesAnalytics` "vs previous"**: previously always the preceding *N days*; now the equal-length window before the one asked for, so a picked day compares against the day before it.

## Coverage

```
npx jest lib/report-window lib/report-range-picker lib/export --selectProjects logic --coverage
File                     | % Stmts | % Branch | % Funcs | % Lines
All files                |   96.06 |    88.57 |   93.02 |   97.98
  report-range-picker.ts |   94.73 |    88.88 |     100 |     100
  report-window.ts       |   93.82 |    88.23 |      80 |   95.71
  analytics-export.ts    |     100 |    88.88 |     100 |     100
```

Above the 80% floor on every axis.

## Full-suite state

| Suite | Result |
|---|---|
| `webnegosyo-app`: `npx jest --maxWorkers=2` | **395 suites, 4894 tests, all pass** |
| `convex-template`: `npx tsc --noEmit -p .` | clean |
| `webnegosyo-app`: `npx tsc --noEmit -p .` | clean |
| root: `npm run lint` | 26 errors / 341 warnings — **unchanged pre-existing floor**; zero findings in any file this branch touched |

**Root web suite** (`npx jest --config jest.config.cjs`) reports `tests/unit/storefront-menu-runtime.test.tsx` failing **in the working tree**. This is not from this work: the tree is shared with other sessions and carries ~50 uncommitted files. Verified by running that suite in clean git worktrees — `origin/main` 12/12 pass, and this branch's `HEAD` **also 12/12 pass**. The failure is caused by uncommitted changes belonging to another session.

## Known gaps / follow-ups

1. **Convex tenants need a redeploy.** `CURRENT_SCHEMA_VERSION` 31 → 32. Until a store is re-pushed, picking a date against it fails — visibly, as the existing "Some reports need a backend update" banner, never silently. Presets are unaffected by design. The platform-Supabase tenants work immediately.
2. **Product Analytics was not re-wired.** It already had its own single-day picker (`selectedDay` + a filter sheet listing days that actually have orders), so it is not blind to per-date today. It cannot do a custom *range*. Folding its two state fields into the shared `ReportSelection` is a contained follow-up, deliberately not bundled here because that screen carries a lot of other filter logic.
3. **Trends chart with a wide range.** A 90-day custom range renders 90 bars. Weekly bucketing or horizontal scroll past ~45 days is still owed.
4. **No device run.** Everything is verified by unit, integration and rendered-component tests plus typecheck. Nothing here has been exercised on a phone against a live store.
5. **Fetch-cap honesty.** `MAX_RANGE_DAYS = 366` keeps a range inside what a 10 000-row read can serve, and the picker refuses wider spans. On an exceptionally busy store a long range could still truncate; the export path already reports coverage, the screens do not.

## Merge evidence

15 checkpoint commits on `feat/report-date-range`, alternating `test:` (RED) and `feat:` (GREEN), plus one `refactor:`. If squashed, this file is the retained record of what was verified and how.
