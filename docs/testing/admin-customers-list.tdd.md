# TDD Evidence — Web-Admin Customers List Page

**Task:** Build the web-admin "Customers" (Regulars) list page.
**Branch:** `feat/superadmin-convex-analytics`
**Date:** 2026-07-10

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
existing (already-tested) customer data layer, which had no owner-facing UI:

- `supabase/migrations/20260706120000_customer_identity.sql` — `customers` table
- `src/lib/customer-identity.ts` / `src/lib/customers-service.ts` — identity,
  capture, and the admin-scoped `getCustomersByTenant` / `getCustomerDetail` reads
- `src/lib/orders-service.ts:523-544` — going-forward capture wired into checkout

The reads existed but had **zero callers**. This task adds the presentation.

## User journeys

1. As a merchant, I want to see a list of my repeat customers with their spend and
   order count, so I know who my regulars are.
2. As a merchant, I want to search my customers by name or phone, so I can find one fast.
3. As a merchant, I want to sort by top spenders / most frequent, so I can spot my best customers.
4. As a merchant, when a customer has no name I still want to identify them by phone/email.
5. As a merchant, I want to see a customer's most-ordered items and channels.

## Scope decision

The testable unit is `CustomersList` — a pure presentational client component that
receives an already-loaded `Customer[]` and owns only local UI state (search text,
sort order, expanded row). The page (`/[tenant]/admin/customers/page.tsx`) is a thin
server-component wrapper over the existing, already-tested `getCustomersByTenant`
(mirrors the orders-page pattern). Search + re-sort are client-side over the loaded
page. **Known follow-up:** server-side sort + pagination via the service's existing
`sort`/`limit`/`offset`/`search` params.

## Task report

| Step | Command | Result |
|------|---------|--------|
| RED — spec written, component missing | `npx jest tests/unit/customers-list.test.tsx --no-cache` | `Cannot find module '.../customers-list'` — compile-time RED (intended: production module absent). Commit `92922f1`. |
| GREEN — implement CustomersList + page + skeleton + nav | `npx jest tests/unit/customers-list.test.tsx` | `Tests: 8 passed, 8 total`. Commit `2b0445b`. |
| Harden — 3 added tests (frequent sort, no-results, no-items) | `npx jest tests/unit/customers-list.test.tsx` | `Tests: 11 passed, 11 total`. Commit `<test-harden>`. |
| Lint | `npx eslint <4 changed files>` | exit 0 |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` (filtered to new files) | no errors in new files |
| Coverage | `npx jest customers-list --coverage --collectCoverageFrom=...customers-list.tsx` | stmts 99.6% / branch 85.4% / funcs 100% |
| Regression | `npx jest` (full) | 1495 passed; only pre-existing `webnegosyo-app/` printer + order-image suites fail (separate app, untouched) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Empty tenant renders a "No customers yet" empty state | `customers-list.test.tsx › shows an empty state…` | unit | PASS |
| 2 | Each customer row shows name, "N orders", and peso-formatted total spent | `…renders a row per customer…` | unit | PASS |
| 3 | Nameless customer displays their phone as the label | `…falls back to the phone number…` | unit | PASS |
| 4 | Name- and phone-less customer displays their email | `…falls back to the email…` | unit | PASS |
| 5 | Search box filters the list by name (case-insensitive) | `…filters the list by name…` | unit | PASS |
| 6 | Search also matches the phone number | `…matches the search against the phone…` | unit | PASS |
| 7 | "Top spenders" re-sorts by total_spent desc | `…re-sorts by total spent…` | unit | PASS |
| 8 | "Most frequent" re-sorts by order_count desc | `…re-sorts by most frequent…` | unit | PASS |
| 9 | A non-matching search shows a "no customers match" message | `…shows a no-results message…` | unit | PASS |
| 10 | Opening a customer with no items notes "No items recorded" | `…notes when an opened customer has no…` | unit | PASS |
| 11 | Opening a customer reveals their most-ordered items | `…reveals a customer's most-ordered items…` | unit | PASS |

## Coverage and known gaps

- `src/components/admin/customers-list.tsx`: **99.6% stmts, 85.4% branch, 100% funcs**
  (`npx jest tests/unit/customers-list.test.tsx --coverage`). Only the `recent`
  default switch arm is uncovered (line 155) — behaviourally equivalent to the tested path.
- The server page (`page.tsx`), skeleton, and sidebar link are not unit-tested — they
  are thin wiring over the already-tested `getCustomersByTenant`; verified via lint + tsc.
  E2E of the rendered page is a follow-up.
- Server-side sort/pagination through the service params is a deliberate follow-up.

## Files changed

- `src/components/admin/customers-list.tsx` (new) — searchable/sortable list + inline detail
- `src/components/admin/customers-skeleton.tsx` (new) — Suspense fallback
- `src/app/[tenant]/admin/customers/page.tsx` (new) — server page over `getCustomersByTenant`
- `src/components/shared/sidebar.tsx` — "Customers" nav item after "Orders"
- `tests/unit/customers-list.test.tsx` (new) — 11 behavioural specs

## Merge evidence (for squash)

- RED `92922f1`: spec fails at module resolution (component absent) — intended.
- GREEN `2b0445b`: implementation makes all 8 core specs pass.
- Harden: +3 specs → 11/11, branch coverage 77.5% → 85.4%.
- Full suite: 1495 passing; the 2 failing suites are pre-existing `webnegosyo-app/`
  (printer + order-image) failures in a separate app, unrelated to this change.
