# TDD Evidence — Full analytics report CSV export (merchant app)

## Source plan

No `*.plan.md`; journeys derived from the user request: "I want to be able to
export all the data possible on the analytics as well."

## User journeys

1. As a merchant on the Analytics screen, I want an Export button that
   produces one CSV containing everything the screen shows, so I can analyze
   or archive my store's performance outside the app.
2. As a merchant whose tenant backend predates some analytics queries, I want
   missing sections marked "Not available" in the export, so the report never
   silently omits data.

## What shipped

- `webnegosyo-app/lib/export/analytics-export.ts` — pure
  `buildAnalyticsReportCsv`: one sectioned, BOM-prefixed, CRLF, formula-guarded
  CSV covering sales overview, orders by status, revenue by order type /
  payment method, payment method detail, peak hours + full day/hour grid,
  customer insights + top customers, upsell funnel + revenue + daily
  conversion, bundles, and top items. Rates exported as percentages.
- `runAnalyticsExport` in `run-export.ts` — filename
  `analytics_<daysBack>d_<YYYY-MM-DD>.csv`, shares via the (lazy-loaded)
  `shareCsv`.
- Export button + shared `ExportSheet` on `app/(main)/analytics.tsx`
  (no window presets; exports the period the screen's 7/14/30-day pills have
  selected).

## Task report

- **RED** — `analytics-export.test.ts` (8 tests) + `run-analytics-export.test.ts`
  (1 test) written first; `npx jest` failed to compile both suites because
  `./analytics-export` and `runAnalyticsExport` did not exist (compile-time
  RED exercising the missing implementation). Commit `f9e109a`.
- **GREEN** — after implementing the builder + orchestrator: full export suite
  `npx jest lib/export` → **64/64 PASS**. Commit `30d7d33`. Screen wiring in
  `2e389e4`; `npx tsc --noEmit` clean, ESLint clean on all changed files.

## Test specification

| # | What is guaranteed | Test | Result |
|---|--------------------|------|--------|
| 1 | Report starts with BOM and names the period | starts with the BOM… | PASS |
| 2 | Every screen section appears in the CSV (12 section titles) | includes every section… | PASS |
| 3 | Sales KPIs flatten to metric/value rows | flattens the sales KPIs… | PASS |
| 4 | Rates export as percentages (4.8 not 0.048) | exports rates as human percentages… | PASS |
| 5 | Heatmap slots use day names; peak/quiet summarized | renders heatmap slots… | PASS |
| 6 | Customer names are formula-guarded (`'=HYPERLINK…`) | formula-guards attacker-controlled strings | PASS |
| 7 | Missing datasets render "Not available", never vanish | marks a section as not available… | PASS |
| 8 | Top items/customers ranked from 1 | ranks top items… | PASS |
| 9 | runAnalyticsExport shares `analytics_30d_2026-08-19.csv` with the report | run-analytics-export.test.ts | PASS |

## Coverage and known gaps

`npx jest lib/export --coverage`: lib/export 98.59% stmts / 100% funcs;
`analytics-export.ts` 100% lines. Gaps (intentional): the screen wiring has no
RN render test (matches the existing orders/customers export precedent — the
logic lives in tested pure modules); `dailyBreakdown` from payment analytics
is not exported (the screen doesn't render it either — follow-up if wanted).

## Merge evidence

RED `f9e109a` (2 suites fail on missing implementation) → GREEN `30d7d33`
(64/64) → screen wiring `2e389e4` (tsc + lint clean).
