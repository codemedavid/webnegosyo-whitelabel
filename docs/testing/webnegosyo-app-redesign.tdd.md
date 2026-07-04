# TDD Evidence Report — webnegosyo-app Branding Studio Redesign

**Branch:** `redesign/webnegosyo-app-branding-theme`
**Date:** 2026-07-05

## Source plan

No `*.plan.md` was provided; user journeys were derived during this TDD run
from the request: full redesign of the merchant admin app using the web
Branding Studio design language, plus improved analytics layout/data.

## User journeys

1. As a merchant, I want the admin app to share the Branding Studio's
   editorial look (charcoal/cream/coral), so the platform feels cohesive.
2. As a merchant, I want the analytics screen to lead with clear KPIs and
   growth direction, so I can read business health at a glance.
3. As a merchant, I want breakdowns, peak hours, and customer insights
   presented readably (shares, "Fri 7 PM" summaries), so I can act on them.

## Task report

| Task | Validation command | RED evidence | GREEN evidence |
|---|---|---|---|
| Jest infra | `npm test` (webnegosyo-app) | n/a (infra) | 3 pre-existing suites, 39 tests pass |
| Theme tokens | `npm test -- theme/colors.test.ts` | Compile-time RED: `TS2339: Property 'accent'/'tabBarActive'/'eyebrow' does not exist` — test exercised missing tokens (commit `test: add reproducer for Branding Studio theme tokens`) | 26/26 pass after rewriting `theme/colors.ts` (commit `feat: port Branding Studio editorial theme`) |
| Analytics utils | `npm test -- lib/analytics-utils.test.ts` | Compile-time RED: module `lib/analytics-utils.ts` missing (commit `test: add reproducer for analytics data-shaping utils`) | 17 tests pass after implementing the module (commit `feat: add analytics data-shaping utils`) |
| Screen restyle + analytics rebuild | `npx tsc --noEmit && npm test` | n/a (presentation refactor on tested tokens/utils) | tsc clean, 5 suites / 85 tests pass |

Ratio contract check: Convex `analytics.ts` returns decimal ratios
(`cancellationRate = cancelled/total`, `revenueGrowth = Δ/prev`,
convex-template/convex/analytics.ts:349-352). UI call sites convert ×100
once before `formatPercent`/`classifyGrowth` (verified by grep + review).

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Theme exports the Branding Studio palette (charcoal `#1D1815`, cream `#EFECE6`, coral `#E4572E`, warm border `#E5E0D6`) | `theme/colors.test.ts` | unit | PASS |
| 2 | Dark tab rail tokens (charcoal bg, amber active, translucent inactive) exist | `theme/colors.test.ts` | unit | PASS |
| 3 | All semantic tints + status bg/text pairs present and hex-valid; danger ≠ accent | `theme/colors.test.ts` | unit | PASS |
| 4 | Editorial type scale (24/800 title, eyebrow style), 10px card radius, warm shadows, unchanged spacing scale | `theme/colors.test.ts` | unit | PASS |
| 5 | `formatPercent` renders 1-decimal %, drops trailing .0, zero-safe on NaN/∞ | `lib/analytics-utils.test.ts` | unit | PASS |
| 6 | `classifyGrowth` signs labels, flat under 0.05%, undefined-safe | `lib/analytics-utils.test.ts` | unit | PASS |
| 7 | `withShares` sorts desc, computes % of total, zero-total safe, does not mutate input | `lib/analytics-utils.test.ts` | unit | PASS |
| 8 | `buildFunnelSteps` ratios relative to first stage with 4% min visibility; zero-base → all zero | `lib/analytics-utils.test.ts` | unit | PASS |
| 9 | `describePeakHour` renders "Fri 7 PM", handles midnight/noon, em-dash on missing | `lib/analytics-utils.test.ts` | unit | PASS |
| 10 | `buildTrendSeries` maps getTrends rows to M/D-labelled chart points per metric | `lib/analytics-utils.test.ts` | unit | PASS |

## Coverage and known gaps

- Full suite: **5 suites / 85 tests, all passing** (`npm test`).
- Component/screen rendering is not unit-tested — the app has no RN testing
  harness (jest config deliberately scoped to `lib/` + `theme/` pure logic);
  screens were verified via `tsc --noEmit` (clean) and code review.
  Adding `jest-expo` + RTL for screen tests is a known follow-up.
- Visual verification on device/simulator is a manual follow-up for the user.

## Merge evidence

RED/GREEN checkpoint commits on the branch, in order:
1. `chore: add jest infrastructure to webnegosyo-app`
2. `test: add reproducer for Branding Studio theme tokens (RED)`
3. `feat: port Branding Studio editorial theme to webnegosyo-app (GREEN)`
4. `test: add reproducer for analytics data-shaping utils (RED)`
5. `feat: add analytics data-shaping utils (GREEN)`
6. `feat: redesign webnegosyo-app UI with Branding Studio editorial theme`

If squash-merged, this table plus the task report above preserves the
RED/GREEN sequence.
