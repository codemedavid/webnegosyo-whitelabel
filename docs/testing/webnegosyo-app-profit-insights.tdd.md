# TDD Evidence — Merchant App Profit, Fast-Movers & Revenue Concentration Analytics

**Source plan:** Conversational `/ecc:plan` run (2026-07-10). Journeys derived during this TDD run.
**Scope:** `webnegosyo-app/` (merchant admin mobile app), Products/Performance tab.

## User Journeys

1. As a merchant, I want to see my **fast-moving products**, so I know which items sell fastest and should never run out.
2. As a merchant, I want to see which items have the **highest margins**, so I can push the ones that keep the most money.
3. As a merchant, I want to see my **total profit and cost** for the period, so I understand what I actually keep.
4. As a merchant, I want to see **which few items drive most of my revenue** (e.g. "70% comes from 5 items"), so I know where my business is concentrated and where the risk sits.

## Approach

All data already exists in Convex `productAnalytics` (`totalRevenue`, `totalCost`, `totalProfit`,
`marginPercent`, `totalUnitsSold`, `avgDailyUnits`) via `productAnalytics:getAll`, already fetched by the
Performance screen. The only new logic is pure ranking/summary/Pareto math, computed client-side — **no
Convex change, no migration, no tenant redeploy**. Profit uses *current* cost (cost-at-sale capture is a
documented follow-up, see Known Gaps).

Per `webnegosyo-app/jest.config.js`, UI/screens are out of automated-test scope ("exercised manually via
Expo"); the testable unit is the pure `lib/profit-analytics.ts` module. It is covered RED→GREEN below.

## Task Report

### Task 1 — Pure helpers (`lib/profit-analytics.ts`)
- **Summary:** Added `computeProfitSummary`, `rankByVelocity`, `rankByMargin`, `computeRevenueConcentration`.
- **RED:** `npx jest profit-analytics` → *"Cannot find module './profit-analytics'"* (compile-time RED; the
  new test exercises code that did not yet exist).
- **RED (behavioral):** After first implementation, 6/20 failed — `computeRevenueConcentration` threw
  `ReferenceError: Cannot access 'items' before initialization` (real TDZ bug: referenced the array inside
  its own `.map` initializer). Fixed by using the map index.
- **GREEN:** `npx jest profit-analytics` → **20 passed, 20 total**.
- **Guarantees:** profit rollup weights margin by revenue and derives cost from margin when no explicit cost
  is stored; velocity/margin rankings exclude non-qualifying rows and never mutate input; Pareto math yields
  correct per-item + cumulative shares, top-N headline, and fewest-items-for-threshold, degrading safely on
  empty input.

### Tasks 2–5 — UI (`components/ProfitInsights.tsx`, `app/(main)/product-analytics.tsx`)
- **Summary:** New presentational `ProfitInsights` component renders four sections from the tested helpers;
  wired above the existing product list on the Performance tab. Added `totalCost`/`totalProfit` to the
  screen's `AnalyticsRow` type so real stored values flow through.
- **Validation:** `npx tsc --noEmit` → no errors. Manual Expo verification pending (out of jest scope).
- **Graceful degradation:** profit section prompts to add costs when nothing is costed; concentration/
  fast-movers show "not enough sales data" when empty; screen still short-circuits with `ErrorState` when
  Convex is unconfigured.

## Test Specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Profit summary sums cost/profit over costed rows and revenue-weights the margin | `lib/profit-analytics.test.ts` › computeProfitSummary | unit | PASS |
| 2 | Total revenue counts every row; cost coverage counts only rows that sold | same | unit | PASS |
| 3 | Cost is derived from `marginPercent` when no explicit cost is stored | same | unit | PASS |
| 4 | Weighted margin is `undefined` and profit `0` when nothing is costed; empty input is safe | same | unit | PASS |
| 5 | Fast movers sort by daily velocity, drop no-sale items, respect limit, don't mutate input | `…` › rankByVelocity | unit | PASS |
| 6 | Highest-margin keeps only costed rows, sorts by margin desc, respects limit | `…` › rankByMargin | unit | PASS |
| 7 | Concentration orders by revenue with correct per-item + cumulative shares | `…` › computeRevenueConcentration | unit | PASS |
| 8 | Top-N headline + fewest-items-for-threshold (default 80%) computed correctly | same | unit | PASS |
| 9 | Custom `topN`/`paretoThreshold` honored; headline capped at items available | same | unit | PASS |
| 10 | Zero-revenue rows excluded; empty input yields safe "not enough data" defaults | same | unit | PASS |

## Coverage & Known Gaps

- **Suite:** `npx jest` (webnegosyo-app) → **16 suites, 217 tests, all passing** (20 new).
- **Typecheck:** `npx tsc --noEmit` → clean.
- **UI:** intentionally not unit-tested (project convention); verify manually on the Performance tab against a
  Convex-enabled tenant across 7d/30d/all.
- **Historical cost accuracy:** profit uses the *current* cost price, not cost at time of sale. Accurate
  historical profit would require capturing cost on Convex `orderItems` (schema change + tenant redeploy) —
  deferred as a follow-up.
- **Staleness:** `productAnalytics` is precomputed; the existing pull-to-refresh (`refreshAnalytics`) recomputes.

## RED/GREEN Summary (for squash merge)

RED: new `profit-analytics.test.ts` failed to resolve `./profit-analytics` (module absent), then surfaced a
real TDZ bug in the Pareto loop. GREEN: 20/20 helper tests pass; full app suite 217/217; `tsc` clean.
