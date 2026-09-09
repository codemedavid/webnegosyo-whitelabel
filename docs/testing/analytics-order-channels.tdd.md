# Analytics: orders by channel

## Source plan

No `*.plan.md`. Journeys derived during this TDD run from the request: *"on the
webnegosyo-app analytics we also want to see how many ordered through POS and
on other order types as well."*

## The defect this closes

`analytics:getSalesAnalytics` reported the channel split as a hand-counted pair:

```ts
ordersBySource: { web: webOrders, mobile: mobileOrders }
```

Every other value of `orders.source` — `pos` (the register), `qr_handoff`,
`manual` — was counted in `totalOrders` and attributed to nowhere. A store doing
most of its trade at the till saw a card that accounted for a fraction of its
own orders, with no indication the rest existed. The Trends screen drew the same
two bars, and the CSV export wrote the same two rows.

## User journeys

1. As a merchant, I want to see how many of my orders were rung up at the
   counter, so that I can weigh the register against the website.
2. As a merchant, I want every channel I actually took orders through listed —
   QR table handoff included — so that the split adds up to my order count.
3. As a merchant on a store whose backend has not been redeployed, I want the
   figures that backend *can* report, and no invented ones.
4. As a merchant exporting the report, I want the channel split in the CSV.

## Task report

### 1. Channel grouping in the Convex backend

Extracted `summarizeOrderChannels` to `convex-template/convex/analyticsChannels.ts`
(the query handler needs a live deployment, so the grouping is tested on its
own — the same shape as `orderStats.ts`), and called it from
`getSalesAnalytics`. Counts include cancelled orders so they sum to
`totalOrders`; revenue excludes them so it matches `totalRevenue`.

- Validation: `npx jest --config jest.config.cjs convex-template/convex/analyticsChannels`
- RED: `Cannot find module './analyticsChannels'` — 1 failed, 0 tests.
- GREEN: `Tests: 4 passed, 4 total`.

### 2. The platform-backend port

`computeSalesAnalytics` in `webnegosyo-app/lib/backends/analytics-compute.ts`
gained the identical grouping, so a platform-backend store reads the same
figures its Convex neighbour would.

- Validation: `npx jest --selectProjects logic lib/backends/analytics-compute`
- RED: the existing exact-shape assertion failed on the missing
  `ordersByChannel` key.
- GREEN: `Tests: 30 passed`.

### 3. Presentation, labels, and the stale-backend fallback

New `webnegosyo-app/lib/order-channels.ts`: `ORDER_SOURCE_LABELS` (one map, now
also the source of the Products screen's filter labels) and
`buildOrderChannelRows`, which labels, ranks, and shares each channel and
degrades to `web`/`mobile` — revenue `null`, not `0` — when the backend does
not send the split.

- Validation: `npx jest --selectProjects logic lib/order-channels`
- RED: `Cannot find module './order-channels'`.
- GREEN: `Tests: 12 passed, 12 total`.

### 4. Screens and export

`analytics.tsx` replaces the two-number source card with a
"Where Orders Came From" bar list; `trends.tsx` draws one bar per channel;
`analytics-export.ts` adds an `ORDERS BY CHANNEL` section, omitted rather than
faked when the backend does not report it.

- Validation: `npx jest --selectProjects logic lib/export` and `npx tsc --noEmit`.
- GREEN: `Tests: 115 passed` across 13 export/filter suites; no type errors in
  any file this change touches.

### 5. Reaching tenants

`analyticsChannels.ts` is a new template module, so the committed push bundle
was stale — `tests/unit/convex-push-bundle.test.ts` caught it. Rebuilt with
`npm run convex:prebundle`; `CURRENT_SCHEMA_VERSION` bumped 26 → 27.

- RED: `- "analyticsChannels.ts"` missing from the shipped bundle.
- GREEN: `Tests: 6 passed, 6 total`.

## Test specification

| # | What is guaranteed | Test file or command | Type | Result |
|---|--------------------|----------------------|------|--------|
| 1 | Every channel the orders came from is counted, busiest first | `convex-template/convex/analyticsChannels.test.ts:counts every channel the orders came from` | unit | PASS |
| 2 | A cancelled order is counted but its money stays out of channel revenue | `analyticsChannels.test.ts:counts a cancelled order but keeps its money out` | unit | PASS |
| 3 | An order with no recorded channel gets an empty key, not silent omission | `analyticsChannels.test.ts:files an order with no recorded channel` | unit | PASS |
| 4 | The platform backend counts counter sales as their own channel | `lib/backends/analytics-compute.test.ts:counts counter sales as their own channel` | unit | PASS |
| 5 | `ordersBySource` is unchanged, so the web admin keeps working | `analytics-compute.test.ts:summarises revenue, orders, cancellations` | unit | PASS |
| 6 | Known channels get the app's own names (pos → Counter) | `lib/order-channels.test.ts:labels every known channel` | unit | PASS |
| 7 | An unrecognised channel is named from its key rather than hidden | `order-channels.test.ts:names an unrecognised channel from its own key` | unit | PASS |
| 8 | Each channel's share is of all orders in the period | `order-channels.test.ts:reports each channel's share` | unit | PASS |
| 9 | A store on an older backend still sees web/app, with revenue unknown | `order-channels.test.ts:a store whose backend predates the channel split` | unit | PASS |
| 10 | The full split wins when a backend sends both shapes | `order-channels.test.ts:prefers the full split` | unit | PASS |
| 11 | The CSV carries a channel section with share and revenue | `lib/export/analytics-export.test.ts:breaks the orders out by channel` | unit | PASS |
| 12 | The CSV omits the section rather than faking it | `analytics-export.test.ts:omits the channel section` | unit | PASS |
| 13 | The shipped Convex bundle carries the new module | `tests/unit/convex-push-bundle.test.ts:is not stale` | integration | PASS |

## Coverage

```
npx jest --selectProjects logic --coverage --collectCoverageFrom='lib/order-channels.ts' --collectCoverageFrom='lib/backends/analytics-compute.ts'

File                   | % Stmts | % Branch | % Funcs | % Lines
  order-channels.ts    |     100 |    88.88 |     100 |     100
  analytics-compute.ts |   96.87 |    86.79 |     100 |     100
```

Full merchant-app logic suite: 291 suites, 3936 tests, all passing.

## Known gaps

- **Not deployed.** Convex stores need a Deploy Schema push to reach v27; until
  then they take the web/mobile fallback. Platform-backend stores get the full
  split as soon as the app ships, since the arithmetic runs on the device.
- **Order types were already covered.** "Revenue by Order Type" has always
  carried a per-type order count; this change was about the channel, which was
  the half that was missing.
- **The web admin still shows two.** `src/components/admin/convex-analytics-tab.tsx`
  and `convex-trends-tab.tsx` read `ordersBySource` directly and were left
  alone — the request was for the merchant app. The field they read is
  unchanged, so nothing there regresses.
- **Pre-existing failures, untouched by this change:** `tests/unit/downloads.test.ts`
  (Android download config still advertises 1.0.5 after the 1.0.6 bump in
  b3a8c860), `tests/unit/lib/leads/leads-analytics.test.ts` (timeout), and the
  in-progress order-type-pricing suites on this branch.

## Merge evidence

RED → GREEN is preserved in two commits on `feat/order-type-pricing`:
`0c934741` (reproducers, all four suites failing) and `42e4cf78` (implementation,
all passing). If squashed, this file is the record.
