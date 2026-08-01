# Daily product analytics + filters (merchant app) — TDD evidence

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
request: *"add filters on the product analytics on the app … the daily going of
the products, how much is the total orders of that product and how much is the
total sales on that day for that products … the top 10 per day and more other
filters"*.

Scope was confirmed with the user before any test was written. They selected
**every** offered filter, plus all three data-scope options:

- Date range + single-day picker
- Top-N per day (10 / 25 / all)
- Sort by units / sales / orders
- Product search + category filter
- Exclude cancelled orders (no toggle — always excluded)
- Order-source (channel) filter
- "vs previous period" delta per product

## User journeys

1. As a merchant, I want to see, per day, each product's units sold, order
   count, and peso sales, so I know what actually moved that day.
2. As a merchant, I want the top 10 (or 25 / all) products for each day, so I
   can act on the leaders.
3. As a merchant, I want to filter by date range / single day, product name,
   category, and order channel, so I can answer specific questions.
4. As a merchant, I want to re-rank by units, sales, or order count, so I can
   distinguish volume from value.
5. As a merchant, I want each product's change vs the previous equal-length
   period, so I can see what is rising or dying.

## Task report

### 1. Daily analytics engine (`lib/product-daily-analytics.ts`)

The pre-aggregated `productAnalytics` Convex table only holds whole-period
totals (7d / 30d / all) and cannot answer "what did this product do on
Tuesday?". A pure module derives the daily grain from raw orders + order items.

- RED — `npx jest lib/product-daily-analytics.test.ts`
  ```
  lib/product-daily-analytics.test.ts:9:8 - error TS2307: Cannot find module
  './product-daily-analytics' or its corresponding type declarations.
  Tests: 0 total
  ```
  Compile-time RED: the missing implementation. Every other error in the run
  (`TS7006 implicitly any`) cascades from that single unresolved import.
- Checkpoint: `5ed66c2 test: add reproducer for daily product analytics filters`
- GREEN — same command: `Tests: 34 passed, 34 total`
- Checkpoint: `b4ceaa9 feat: daily per-product analytics engine with filters and deltas`

Guaranteed: per-day/per-product units, distinct-order counts and peso sales;
Manila-local day bucketing; cancelled orders excluded; half-open date windows;
channel/search/category filtering; metric ranking; per-day top-N that does not
distort that day's totals; previous-window deltas.

### 2. Platform-Supabase line-item read (`lib/backends/`)

The daily view needs order items on both backends. Convex already exposes
`orders:getAllOrderItems`; the platform Supabase adapter did not, and
`OrderItemDto` carried no `orderId`, so items could not be attributed to a day.

- RED — `npx jest lib/backends/supabase-orders.test.ts lib/backends/supabase-adapter.test.ts`
  ```
  ● runPlatformQuery — orders:getAllOrderItems › is claimed as a supported ref …
  ● runPlatformQuery — orders:getAllOrderItems › scopes items to the caller's tenant …
  ● runPlatformQuery — orders:getAllOrderItems › returns item DTOs carrying the parent order id
  ● runPlatformQuery — orders:getAllOrderItems › bounds the read …
  ● runPlatformQuery — orders:getAllOrderItems › returns an empty list …
  ● Test suite failed to run   (TS error on the missing OrderItemDto.orderId)
  Tests: 5 failed, 17 passed, 22 total
  ```
- Checkpoint: `6df6764 test: add reproducers for platform order-item reads`
- GREEN — `npx jest lib/backends/`: `Tests: 70 passed, 70 total`
- Checkpoint: `74cc7a2 feat: serve orders:getAllOrderItems from the platform Supabase backend`

Guaranteed: `order_items` (which has no `tenant_id` of its own) is scoped
through an inner join on its parent order, the read is bounded, and items carry
`orderId` on both backends.

### 3. Filter presets (`lib/product-analytics-filters.ts`)

- RED — `npx jest lib/product-analytics-filters.test.ts`
  ```
  lib/product-analytics-filters.test.ts:10:8 - error TS2307: Cannot find module
  './product-analytics-filters' or its corresponding type declarations.
  ```
- Checkpoint: `test: add reproducer for product analytics filter presets`
- GREEN — same command: `Tests: 16 passed, 16 total`
- Checkpoint: `befa0b7 feat: date-window and filter presets for product analytics`

Guaranteed: windows land on the merchant's **local** day boundary and always
include today; the day picker offers only days that actually have orders;
relative day labels ("Today" / "Yesterday" / "Jul 4").

### 4. Screen wiring (`app/(main)/product-analytics.tsx`)

Jest here only runs pure-logic roots, so the screen is covered by a source-level
mount guardrail, matching the existing `*-mount.test.ts` convention.

- RED — `npx jest lib/product-analytics-screen-mount.test.ts`
  ```
  Tests: 10 failed, 5 passed, 15 total
  ```
  The 5 passes are deliberate: they lock the *existing* BCG/cost/refresh
  behaviour so the additive daily view cannot silently replace it.
- Checkpoint: `test: add guardrails for the daily product analytics screen`
- GREEN — `Tests: 16 passed, 16 total`
- Checkpoint: `29d3a0b feat: day-by-day product analytics with filters on the merchant app`

One guardrail was corrected rather than the implementation: it asserted the
top-N truncation notice lived in the screen source, but the day rows were
extracted into the presentational `components/DailyProductBreakdown.tsx`. The
test now asserts against that component, and additionally pins that the
component makes no ranking or filtering decision of its own.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Orders are bucketed into the merchant's Manila-local day, so 17:30 UTC counts as the next local day | `lib/product-daily-analytics.test.ts:productDateKey` | unit | PASS | `npx jest lib/product-daily-analytics.test.ts` |
| 2 | Each product row reports units, distinct order count, and peso sales per day | `…:reports units, distinct orders, and sales per product per day` | unit | PASS | same |
| 3 | A product on two lines of one order counts as one order, with units summed | `…:counts a product appearing twice in one order as a single order` | unit | PASS | same |
| 4 | Cancelled orders never contribute to any metric | `…:excludes cancelled orders from every metric` | unit | PASS | same |
| 5 | Date windows are half-open — start inclusive, end exclusive | `…:keeps orders on the start boundary and drops orders on the end boundary` | unit | PASS | same |
| 6 | Channel filter restricts to selected sources; empty list means all | `…:filters to the selected order sources` | unit | PASS | same |
| 7 | Product search is case-insensitive and trimmed; category filter excludes uncategorised items | `…:matches the search term case-insensitively` / `…:excludes products with no known category` | unit | PASS | same |
| 8 | Ranking switches correctly between sales, units, and order count, with a stable name tiebreak | `…:ranks by peso sales/units/distinct order count`, `…:breaks ties by product name` | unit | PASS | same |
| 9 | Top-N caps the rows shown but the day's totals stay complete, and truncation is reported | `…:caps each day to topN rows without distorting that day's totals` | unit | PASS | same |
| 10 | Each day is ranked independently | `…:ranks each day independently` | unit | PASS | same |
| 11 | Non-finite quantities/subtotals degrade to 0 instead of producing NaN | `…:ignores non-finite quantities and subtotals` | unit | PASS | same |
| 12 | Items whose parent order is missing or filtered out are dropped | `…:drops items whose parent order is missing` | unit | PASS | same |
| 13 | Previous window is the equal-length period immediately before the current one | `…:previousWindow` | unit | PASS | same |
| 14 | A product with no previous sales is marked New, not +Infinity; a product that stopped selling is carried as -100% | `…:marks a product with no previous sales as new`, `…:carries products that sold previously but not in the current window` | unit | PASS | same |
| 15 | Preset windows land on the local day boundary and always include today | `lib/product-analytics-filters.test.ts:resolveDateWindow` | unit | PASS | `npx jest lib/product-analytics-filters.test.ts` |
| 16 | The day picker offers only days that actually have non-cancelled orders, newest first | `…:listAvailableDays` | unit | PASS | same |
| 17 | Day labels render as Today / Yesterday / "Jul 4", falling back to the raw key | `…:formatDayLabel` | unit | PASS | same |
| 18 | `order_items` is tenant-scoped through an inner join on its parent order | `lib/backends/supabase-adapter.test.ts:scopes items to the caller's tenant through the parent order` | integration | PASS | `npx jest lib/backends/` |
| 19 | The line-item read is bounded rather than scanning every row ever written | `…:bounds the read rather than scanning every line item ever written` | integration | PASS | same |
| 20 | Items carry `orderId` on the platform backend, matching Convex | `lib/backends/supabase-orders.test.ts:carries the parent order id` | unit | PASS | same |
| 21 | The screen reads orders/items through the shared refs and never queries the orders tables inline | `lib/product-analytics-screen-mount.test.ts:daily product analytics data source` | guardrail | PASS | `npx jest lib/product-analytics-screen-mount.test.ts` |
| 22 | Every daily number, window, and delta is derived from the tested pure core, with no inline date maths | `…:daily product analytics computation` | guardrail | PASS | same |
| 23 | The existing lifetime BCG / cost-entry workflow survives alongside the new view | `…:keeps a way back to the lifetime BCG view` | guardrail | PASS | same |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/product-daily-analytics.ts' \
  --collectCoverageFrom='lib/product-analytics-filters.ts' \
  --collectCoverageFrom='lib/backends/supabase-adapter.ts' \
  --collectCoverageFrom='lib/backends/supabase-orders.ts'

File                           | % Stmts | % Branch | % Funcs | % Lines
All files                      |   98.05 |     86.5 |     100 |   99.11
  product-analytics-filters.ts |     100 |     90.9 |     100 |     100
  product-daily-analytics.ts   |   97.84 |    93.33 |     100 |     100
  supabase-adapter.ts          |   97.33 |       80 |     100 |   98.55
  supabase-orders.ts           |   98.14 |    85.07 |     100 |   97.87
```

Above the 80% threshold on every axis. Full merchant-app suite:
`npx jest` → **53 suites, 869 tests, all passing**. `npx tsc --noEmit` clean.
`npx eslint` clean on all changed files.

### Known gaps / follow-ups

- **Not verified against a running app.** All evidence is unit + source-level
  guardrail. The daily view has not been rendered on a device or against a live
  tenant, so the visual layout and real-data volume are unproven.
- **`ORDER_FETCH_LIMIT = 2000`.** A store exceeding 2000 orders inside the
  selected window would silently clip the oldest ones. The 90-day preset on a
  high-volume tenant is the realistic trigger. A date-bounded server-side read
  would remove the ceiling; the current refs do not accept a date range.
- **Convex tenants need no deploy** — both refs (`orders:getOrders`,
  `orders:getAllOrderItems`) already exist in the deployed template. Tenants on
  an older bundle surface the honest "needs a backend update" placeholder via
  `isMissingFunction` rather than an empty chart.
- **Timezone is the fixed PH UTC+8 default**, matching `convex/time.ts`. A
  per-tenant timezone would thread through the `offsetMs` parameter that every
  helper already accepts.
- **Category filter depends on `menu_items.category_id`**; products whose
  category is null are excluded when a specific category is selected (tested),
  and included under "All".

## Merge evidence

RED → GREEN → refactor summary, preserved here in case the checkpoint commits
are squashed:

| Stage | Commit | Evidence |
|---|---|---|
| RED 1 | `5ed66c2` | TS2307 missing module, 0 tests run |
| GREEN 1 | `b4ceaa9` | 34/34 pass |
| RED 2 | `6df6764` | 5 failed / 17 passed + TS error on missing `orderId` |
| GREEN 2 | `74cc7a2` | 70/70 pass in `lib/backends/` |
| RED 3 | (filter presets) | TS2307 missing module |
| GREEN 3 | `befa0b7` | 16/16 pass |
| RED 4 | (screen guardrails) | 10 failed / 5 passed |
| GREEN 4 | `29d3a0b` | 16/16 pass; full suite 869/869; tsc clean |

Refactor performed while green: renamed the screen's `window` local to
`dateWindow` (it shadowed the global), and extracted the day rows into
`components/DailyProductBreakdown.tsx` + a generic `components/OptionPills.tsx`.
Full suite re-run after the refactor: 869/869.
