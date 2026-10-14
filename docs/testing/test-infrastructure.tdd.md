# Phase 0e — test infrastructure (TDD evidence)

Plan: `docs/plans/2026-10-12-reports-and-inventory-suite.md` §1.3 "Test infrastructure", §9 Phase 0e, §10.1–10.2.

Before this phase: no CI ran Jest; the 23 PGlite SQL runners could not run (dependency not installed); `fakeSupabaseTables` had no row cap and a `range` that ended the chain; the only property test was a hand-rolled seeded loop.

## What changed

| Piece | Where | What |
|---|---|---|
| Dependencies | `package.json` devDeps (exact pins) | `fast-check@4.10.2`, `@electric-sql/pglite@0.5.8` (both ≥ 2 weeks old). Lockfile updated with `--package-lock-only`; the shared `node_modules` got the three package folders copied in, NOT a reinstall (the main checkout's tree is deliberately out of sync with its lockfile and other sessions use it). |
| Scripts | `package.json` | `test:property` (only `*.property.test.*`, 300 s per-test budget), `test:sql` (`tests/sql/run-all.cjs`). |
| CI | `.github/workflows/tests.yml` | Jobs `web` (Jest, `FC_NUM_RUNS=200`), `sql` (PGlite runners), `app` (merchant app Jest, 20 s default per-test budget), nightly `property` (`FC_NUM_RUNS=5000`). Placeholder Supabase env vars (the repo is public; never secrets). Live suites stay skipped (each gates on its own `=1` variable). |
| Fake Supabase (L2) | `tests/fixtures/fake-supabase-tables.ts` | Every response capped at `PLATFORM_MAX_ROWS` = 1000 (configurable per project); filter → order → range → cap applied at settle, whatever the call order; `range`/`limit` chainable; `eq/neq/gt/gte/lt/lte/in/is/not(in|is|eq)`; multi-column order with Postgres null placement; `select('*')`, `count: 'exact'` (+`head`), `single`/`maybeSingle`; `requests` log (window + rows returned) for page counting. An unmodelled `not` operator throws instead of matching silently. |
| Generator (L1/L2) | `tests/fixtures/report-orders.ts` | `reportOrdersArb` — fast-check orders in whole centavos with reversed statuses, refunds, unpaid and over-paid ledgers, unrecorded lines, drifted bills, delivery discounts, NULL branches/categories, tables. `toPlatformRows` / `toPlatformTables` — the inverse of `toReportOrder`, money as numbers or text, discount in the column or the POS blob. |
| Property settings | `tests/utils/property.ts` | `propertyParameters()`: `FC_NUM_RUNS` (default 200), replay with `FC_SEED` + `FC_PATH`; malformed values throw. |
| Conventions guard | `tests/unit/property-test-conventions.test.ts` | Every `fc.assert` lives in a `*.property.test.*` file and takes `propertyParameters()`, so the nightly depth reaches it. |
| SQL harness (L3) | `tests/sql/lib/platform-auth.cjs`, `tests/sql/run-permission-keys.cjs`, `tests/sql/run-all.cjs` | Roles + `auth.uid()` + Supabase default grants; the 0d migrations re-checked as every role (57 checks; see `permission-keys.tdd.md`). |

## RED → GREEN

| Test | RED | GREEN |
|---|---|---|
| `tests/unit/fake-supabase-tables.test.ts` (20) | 14 failed: no cap, no `PLATFORM_MAX_ROWS`, no `requests`, string-only compares, no `not`/`is`/`gt…`, window applied before order, `*` projected to `{}`, no `count`, no `single` | 20/20; the existing consumer (`loyalty/order-customer-repository.test.ts`) still 8/8 |
| `tests/unit/inventory-daily-revenue-paging.test.ts` (6) — invariant 11 | written against the already-paging reader, so mutation-checked instead: `PAGE_SIZE = 2000` → 999/1000 pass, **1001/2000/2001 fail** (the old hand-rolled mock in `inventory-daily-revenue-read.test.ts` passes that mutation) | 6/6: capped paged read = uncapped read = Σ net sales computed from the generated orders, at 999/1000/1001/2000/2001 served rows, with another store's orders and orders either side of the Manila day mixed in |
| `tests/sql/run-permission-keys.cjs` (57) | mutation: letting `kitchen` read payments in 120200 → fails "kitchen sees orders, no payments, no revisions" | 57/57 |
| `tests/unit/reports/report-orders-generator.property.test.ts` (10) | written after the generator, as its spec (spread, centavos, unique ids, round trip through `toReportOrder`) | 10/10 |

## Found by the new tools

- **fast-check, first run:** `allocateCents(-1, [0, 0])` — the merchant app's bill-split rule returned `-0` for an empty share of a negative amount (a discount), which `Intl` prints as `-₱0.00`; the web copy did not. The old seeded loop never drew all-zero weights with a negative total. Fixed test-first in `webnegosyo-app/lib/bill/money.ts` (RED "never hands back -0" → GREEN; app `lib/bill` 77/77). Needs an app OTA to reach phones; cosmetic only.
- **Live schema, while mirroring it for L3:** `platform_staff_*` policies on orders/payments/revisions (untouched by 120200, now noted in the 0d doc); branch-locked staff never see orders with no branch (before and after 0d).

## Converted

- `sales-invariants.test.ts` → `sales-invariants.property.test.ts`: invariants 1–4 and 6 as four properties over `reportOrdersArb` (the split check now cuts the list at a random point instead of the middle and also checks billed + collected).
- `money.test.ts`'s 500-iteration seeded parity loop → `money.property.test.ts`. `seededRandom` removed from `report-fixtures.ts` (no users left).

## Results (2026-10-14)

| Run | Result |
|---|---|
| Web Jest, CI env (placeholders, `FC_NUM_RUNS=200`) | 1,245 suites passed, 7 skipped; 13,897 tests passed, 26 skipped. One earlier run had 1 failure in `allowance-editor-wiring.test.tsx` (untouched by this work; passes alone and on the rerun — load flake, machine running two other suites) |
| `npm run test:property` at 200 / 5000 runs | 3 suites green; the slowest property takes 0.1 s / 5.3 s |
| `npm run test:sql` | 24/24 runners |
| Merchant app Jest | 544/544 suites, 6,772 tests with 3 workers; one load timeout (`DiscountSheet.test.tsx`, 0.3 s alone) with default workers → the CI job's 20 s default budget |
| `tsc -p tsconfig.build.json` | clean (`tsconfig.json` also reports two `electron` imports in `webnegosyo-desktop/` because this worktree has no desktop `node_modules`; not real) |
| ESLint | 0 errors (167 warnings, unchanged) |

## Not proven

- **The workflow has never run on GitHub.** Every job's commands were run locally; `actionlint` is unavailable, the YAML parses (js-yaml). First real run happens when this branch is pushed. Known soft spot: the app's `expo-router` patch is named for 6.0.23 while the lock pins 6.0.24 — the agent applied both patches to the real 6.0.24 tarballs cleanly, so expect a warning, not a failure.
- The nightly job fires only once the workflow is on `main`.
- Live suites (`tests/live/*`) are opt-in and not part of CI by design.
