# TDD Evidence — Server-Side Pagination for Web-Admin Customers List

**Task:** Add server-side pagination to the web-admin Customers list (follow-up to
`admin-customers-list.tdd.md`, which loaded only the first 100 customers).
**Branch:** `feat/superadmin-convex-analytics`
**Date:** 2026-07-10

## Source plan

No `*.plan.md`. This is the "server-side pagination" follow-up explicitly deferred
in `docs/testing/admin-customers-list.tdd.md` ("Known gaps").

## User journey

- As a merchant with hundreds of customers, I want to page through them, so I'm not
  silently limited to the most recent 100.

## Scope decision

The admin read functions (`getCustomersByTenant`, and now `getCustomersPage`) are thin
Supabase glue and are not unit-testable in this repo's setup (they dynamic-import the
real server client + `verifyTenantAdmin`). Following the existing convention — where
`rowToFacts` is the tested pure part beside the untestable client chain — the
offset/range/clamp math was extracted into a pure `computeCustomersPagination` helper
and fully unit-tested. The Supabase count query and the page's Prev/Next `<Link>`
controls are thin glue, verified by lint + tsc.

## Task report

| Step | Command | Result |
|------|---------|--------|
| RED — pure pagination spec, helper missing | `npx jest tests/unit/customers-pagination.test.ts --no-cache` | `Cannot find module '@/lib/customers-pagination'` — compile-time RED. Commit `d60087d`. |
| GREEN — implement helper + getCustomersPage + wire page | `npx jest tests/unit/customers-pagination.test.ts` | `Tests: 8 passed, 8 total`. Commit `0c2a443`. |
| Related suites still green | `npx jest customers-pagination customers-list customers-service` | `28 passed` |
| Lint | `npx eslint customers-pagination.ts customers-service.ts page.tsx` | exit 0 |
| Typecheck | `npx tsc --noEmit` (filtered to changed files) | no errors in changed files |
| Coverage | `npx jest customers-pagination --coverage` | 100% stmts/branch/funcs |
| Regression | `npx jest` (full) | 1503 passed; same pre-existing 2 `webnegosyo-app/` suites fail (separate app) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | First page: offset 0, range 1–50, prev off / next on | `customers-pagination.test.ts › describes the first page…` | unit | PASS |
| 2 | Middle page: offset 50, range 51–100, prev on / next on | `…describes a middle page` | unit | PASS |
| 3 | Partial last page caps rangeEnd at total, next off | `…caps the range end…` | unit | PASS |
| 4 | Page past the end clamps to the last page | `…clamps a page past the end…` | unit | PASS |
| 5 | Page below 1 clamps to the first page | `…clamps a page below 1…` | unit | PASS |
| 6 | Non-finite (NaN) requested page falls back to page 1 | `…treats a non-finite requested page…` | unit | PASS |
| 7 | Zero customers: no divide-by-zero, empty 0–0 window | `…handles a tenant with zero customers…` | unit | PASS |
| 8 | Single partial page: 1 page, no prev/next | `…handles a single partial page` | unit | PASS |

## Coverage and known gaps

- `src/lib/customers-pagination.ts`: **100% stmts / branch / funcs**.
- `getCustomersPage` (Supabase count + range) and the page's Prev/Next `<Link>`
  controls are thin glue — verified by lint + tsc, not unit tests. An E2E over the
  rendered page (click Next → second window loads) is the remaining follow-up.
- Sort is fixed to `recent` for server pagination stability; per-page search/sort
  remains client-side in `CustomersList`. Wiring server-side sort/search through the
  URL (so they span all pages) is a further follow-up.

## Files changed

- `src/lib/customers-pagination.ts` (new) — pure `computeCustomersPagination`
- `src/lib/customers-service.ts` — `getCustomersPage` + shared `applyCustomerFilters`
- `src/app/[tenant]/admin/customers/page.tsx` — reads `?page`, renders count + Prev/Next
- `tests/unit/customers-pagination.test.ts` (new) — 8 pure specs

## Merge evidence (for squash)

- RED `d60087d`: spec fails at module resolution (helper absent) — intended.
- GREEN `0c2a443`: helper + service + page wiring make all 8 specs pass; list & service
  suites stay green (28/28 combined).
- Full suite: 1503 passing; the only failures are the pre-existing `webnegosyo-app/`
  printer + order-image suites in a separate app, unrelated to this change.
