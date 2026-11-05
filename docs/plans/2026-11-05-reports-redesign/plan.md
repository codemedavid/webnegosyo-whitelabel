# Reports redesign: one place to see the business

Status: **APPROVED 2026-11-05** — owner said yes to every §9 decision except build order: **app first, then web** (see §7).
Research behind it (six parallel studies) lives in `research/`:
- `research-competitors.md`: Toast, Square, Loyverse, Lightspeed, Shopify, StoreHub, UTAK/Mosaic, Clover, TouchBistro, Revel
- `research-kpis-exports.md`: a 45-KPI catalogue, design principles (Few, Knaflic, Tufte, Lean Analytics), report-builder and export spec, PH tax notes
- `research-ux.md`: sitemap, filter bar, KPI cards, tables, insights, export UX, phone + desktop wireframes
- `codebase-inventory.md`: every analytics surface on web and app today, plus the data model and its gaps

This plan **extends** `docs/plans/2026-10-12-reports-and-inventory-suite.md`. Phase 1 of that plan (Sales reports) shipped. Phases 2, 5 and 7 (export, item profit, app coverage) were never built and are absorbed here.

---

## 1. The problem, in the owner's words

> "Everything is so confusing. We can't properly see the sales per month, the profit, the AOV, the average orders and customers per day, the items, the sales variations, the add-ons. Not enough filters. Export should have profit."

What the code audit found behind that:

| Symptom | Cause |
|---|---|
| The same "sales" shows different numbers | Web Dashboard, Owl and Branches add up `orders.total`, which includes service and delivery. Reports shows net sales. The app has **three** engines: on-device Σtotal, the customer hub's "qualified orders", and the SQL twins. So "revenue, last 30 days" can show 4 different numbers. |
| Things are hard to find | About 12 web surfaces plus about 15 app screens, each with its own period control (about 8 different preset sets). Convex analytics hide inside the Orders page, and the Stock page has a tab called "Reports". |
| No sales per month | Every report SQL function is capped at 93 days. Ranges over 31 days are drawn as weekly bars, and there is no "This year" preset. |
| No item profit | Item margin exists only on the old Convex Product Analytics. Platform stores are redirected to a matrix that ranks by **price**, even though the dish cost at sale is already stored in `order_item_costs`. |
| No variations / add-ons | Web and POS store them in different shapes (`variation` text + `addons[]` + `addon_details` vs `variation_selections` jsonb). No SQL reads them. The app approximates them on the phone. |
| No avg orders/customers per day | Not computed anywhere. |
| Few filters | Only period, branch and compare. No order type, channel, payment, staff, category, weekday or hour filter. |
| Can't choose columns | No column picker, no sort, no search, no totals row. |
| No export | There is no sales or report export on web at all. App CSVs use their own formula and cap at 2000 orders. |

Already computed but never shown: discounts by kind (`discountByKind`), void count, the upsell funnel (`analytics_events`), and the customer dashboard (app only).

## 2. What the market taught us (what to copy, what to beat)

**Copy**
1. **Three layers**: an Overview of 4–8 tappable KPI cards → a short report library grouped by question → an expert layer (columns, pivots, export). This is how Shopify, Toast and Square are all built.
2. **Comparison is always on**: previous period, same period last year, or the same weekday average (Toast's weekly email).
3. **Toast's Product Mix tree**: one table, with levels you can collapse (category → item → modifier), "% of parent", a column picker and pinned filters.
4. **Loyverse's baseline**: gross → discounts → net → gross profit tabs, a chart from hourly to yearly, and a per-period table under the chart. Cost and margin appear in every item report.
5. **StoreHub filters**: rule chips (field is / is not value), group by hour of day or day of week, a "?" formula tooltip on every number, and big exports emailed.
6. **Shopify's "edit cards"**: the owner chooses which metrics sit on the Overview.

**Beat**: every competitor is weak here, and we already have the data.
- **Item → Variation → Add-on** with attach rate. Toast flattens it, Square ignores nested modifiers, and StoreHub's totals don't reconcile.
- **Weekday × hour**: Toast and Square users export to Excel to get it.
- **Orders/day and customers/day on the home screen**: nobody does it, and our owners ask for it.
- **Numbers that visibly add up everywhere**: Σ items = Σ categories = Σ channels = net, already guaranteed by `sales-model.ts`.
- **Honest coverage**: "₱41,200 of ₱48,210 sales have a known cost (85%)". Shopify silently drops uncosted products.
- **Export never paywalled** and never different from the screen.

**Avoid**: 40+ reports (Toast), two "net sales" (Toast PMIX vs summary), silently missing rows, long ranges that time out (StoreHub at 10+ months), and gauges or pies.

## 3. Product principles (the rules every screen follows)

1. **One definition.** Every peso shown, on web, app, Owl, MCP or export, comes from `src/lib/reports/` and its SQL twins. A new metric means an engine function, a SQL twin and a parity property test. No exceptions.
2. **One metric registry** drives cards, table columns, ⓘ definitions, export headers, insight wording and permission gating (§5.1).
3. **"Am I OK?" on one phone screen.** Every number says what it is compared to ("▲ ₱6,140 (+15%) vs last Friday").
4. **Grey by default.** Colour only on the change, and red means *bad for that metric*: food cost % going up is red.
5. **Every number is a door.** A card opens its report with the same filters, and a table row opens its detail, then "See orders".
6. **A new question needs a new page; a new filter or column is a view.** (`?cols=`, `?group=`, `?view=` in the URL.)
7. **Owner words.** "Sales", "Average order", "Cost of food", "Profit %", "Money received", "Still to collect", "Came back". The analyst term lives in the ⓘ sheet. English labels with Taglish hints in helper text.
8. **Coverage next to every partial number** (cost coverage, known-customer coverage).
9. **Export = the screen.** Same filters, same columns, same totals, and never a column the viewer isn't allowed to see.
10. **Platform first.** New reports are built and verified on platform Supabase. Convex and tenant-DB stores keep their current pages (they are the minority) until a later coverage phase.

## 4. Information architecture

### 4.1 Web sidebar (after)

```
Home                    ← live "Today" (orders strip, today vs same weekday, to-do), one definition; links into Reports
Reports                 ← ONE entry (replaces Reports group: Sales / Product Analytics; and Money: Profit)
  Overview              /admin/reports                 chosen KPI cards · sales over time · what changed · top items · mix
  ── Sales ──
  Sales by day/month    /admin/reports/periods         ★ NEW: one row per day/week/month, columns you pick (the "sales per month" answer)
  Items                 /admin/reports/items           ★ tree Item › Variation › Add-on; views: Table · By month · Menu matrix (real margin)
  Categories            /admin/reports/categories
  Order types & channels/admin/reports/channels
  Busy hours & days     /admin/reports/hours
  Payments              /admin/reports/payments
  Discounts             /admin/reports/discounts       ★ NEW: by kind (Senior/PWD, voucher, manual, promo, loyalty)
  Staff                 /admin/reports/staff           ★ NEW: sales per cashier / shift
  Branches              /admin/reports/branches        (multi-branch, store-wide accounts)
  Customers             /admin/reports/customers       ★ NEW on web: regulars vs first-timers, came back, best customers (= app Reports tab)
  ── Profit ── (needs `costs`)
  Profit                /admin/reports/profit          existing; + item/category profit link
  ── Books ──
  Export & accountant pack /admin/reports/export       ★ NEW: one place for every download, plus the history of past exports
  Cash & remits         → /admin/cash (linked)
  Senior & PWD book     → /admin/gov-discounts (linked)
  Expenses              → /admin/expenses (linked)
```

**Folded in or renamed:**

| Today | After |
|---|---|
| `/admin/product-analytics` (Convex only, hidden on platform) | Platform: already redirects → Items. Convex: unchanged until the coverage phase. |
| `/admin/menu-engineering` → Boost Sales | Matrix = `Items ?view=matrix`, now on **real margin** when costs exist. Boost stays the *action* page. |
| Sidebar "Product Analytics", "Profit" as separate entries | Under Reports. |
| Stock page tab "Reports" | Renamed **"Daily stock check"** (it is variance, not sales). |
| Dashboard tiles adding up `orders.total` | Same tiles, read from the one definition, plus "See full report →". |
| Visibility bug: `includes('/admin/reports')` hides Profit on non-platform stores | Explicit route list. |

### 4.2 Merchant app (after)

The app's Reports tab keeps its customer-first landing (owners like it), but every number on it and its sub-screens comes from the **same server engine** via `/api/reports/*` (bearer). The ~8 period bars collapse into one `ReportPeriodBar` with the same presets and compare as web. Analytics, Trends and Growth merge into **Overview** (cards and trends) + **Sales by day/month**; Performance becomes **Items** (tree). Phone exports call the server export. Details in Phase 7.

## 5. Foundations (invisible, nothing else is safe without them)

### 5.1 Metric registry: `src/lib/reports/metrics/`

One typed entry per metric:

```ts
interface MetricDef {
  id: MetricId                 // 'net_sales' | 'orders' | 'aov' | 'orders_per_day' | 'customers_per_day' | 'items_sold' | 'cogs' | 'gross_profit' | 'margin_pct' | ...
  label: string                // owner words: "Average order"
  hint: string                 // Taglish helper: "Average na gastos bawat order"
  definition: string           // ⓘ sheet body; formula in plain words
  format: 'money' | 'count' | 'percent' | 'decimal'
  aggregation: 'sum' | 'distinct' | 'ratio'   // how totals rows and long ranges combine it
  ratio?: { numerator: MetricId; denominator: MetricId }
  goodDirection: 'up' | 'down' | 'band'
  permission: 'reports' | 'costs' | 'customers' | 'inventory'
  needs?: 'costs_coverage' | 'customer_coverage'
  ownerReport: ReportId        // where the card / insight links to
  dimensions: DimensionId[]    // which tables may show it as a column
}
```

**v1 metric set** (from the 45-KPI catalogue, trimmed to what our data supports honestly):
- **Sales**: Sales (net), Sales before discounts (gross), Discounts, Orders, Average order, Items sold, Items per order, Average item price, Avg sales per day, Avg orders per day, **Avg customers per day**, Month projection, Money received, Still to collect, Service charge, Delivery fees, Cancelled orders (count, ₱).
- **Profit** (`costs`): Cost of food, Gross profit, Profit %, Food cost %, Cost coverage %.
- **Customers** (`customers`): Customers (unique), New customers, Returning customers, Came-back rate, Known-customer coverage %.
- **Menu**: Qty, Share of sales, Attach rate (add-on / variation), Upsell revenue (from `is_upsell_item`), Combo orders.
- **Discounts**: by kind (Senior, PWD, voucher, manual, promo, loyalty), Discount rate.

**Deliberately absent from v1:** labour % and prime cost (we have shifts but no wages, so they would need payroll input), RevPASH and table turnover (seats aren't captured reliably), and industry benchmarks.

### 5.2 Report query spec (one shape for every table)

```ts
interface ReportQuery {
  period: RelativePeriod | { from: Date; to: Date }      // 'today' | 'last7' | 'this_month' | 'last_month' | 'this_year' | 'last_12_months' | custom
  compare: 'previous' | 'last_year' | 'none'
  branch: BranchScope                                       // forced to own branch for branch-locked accounts (report-context.ts)
  filters: { orderType?: string[]; channel?: string[]; payment?: string[]; staff?: string[]; category?: string[]; weekday?: number[]; hours?: [number, number] }
  rows: DimensionId          // item | variation | addon | category | day | week | month | hour | weekday | channel | order_type | payment | staff | branch | discount_kind
  columns: MetricId[]        // picked by the user; gated by permission
  pivot?: 'month' | 'week' | 'weekday'   // "items by month"
  sort: { by: MetricId; dir: 'asc' | 'desc' }
}
```

It serialises into the URL (relative tokens like `range=last_month`, so a bookmark stays "last month"). The same object feeds the page, the export and saved views.

### 5.3 SQL additions (platform, with the parity rule)

All new functions follow the post-outage pattern: plpgsql `RETURN QUERY EXECUTE … USING`, children via `= any(array(select …))`, SECURITY INVOKER plus permission key, live probes under `set local statement_timeout = '5s'` on a one-day window first.

| Need | Work |
|---|---|
| **Filters on every report** | Extend `reporting.order_figures` scope with an optional `p_filters jsonb` (order type, source, outlet, weekday, hour range, staff). Category and payment filters apply at line and payment level respectively. The existing function signatures gain a defaulted param, so callers don't break. |
| **Variations + add-ons** | `reporting.line_modifiers(...)` normalises both stored shapes (web `variation` + `addon_details`/`addons[]`; POS `variation_selections`) into `(order_item_id, kind, group, option, qty, price_cents)`. A TS twin goes in `src/lib/reports/modifiers.ts`, ported from the app's `lib/product-performance/modifiers.ts`, and joins the parity property test. New `report_sales_by_modifier`. Rows without a recorded price are flagged `estimate` (shown as "~"). |
| **Item / category profit** | `report_sales_by_item` gains `cogs_cents` and `costed_qty` from `order_item_costs` (frozen at sale). Profit columns are gated by `costs`. |
| **Customers per day** | `report_customers_by_period` gives unique customers (customer row, else phone, as in `customer-order-facts.ts`) and new vs returning, per period and in total. A *distinct* count can't be summed across chunks, so long ranges call it once per month and once for the total. |
| **Staff** | Expression index on `(tenant_id, (customer_data->'pos'->>'cashierId'))`, plus a `staff` dimension. Non-POS orders appear as "Online / no cashier". |
| **Discounts by kind** | SQL twin of `discountByKind` (`discount-allocation.ts`) in `report_sales_summary` and a `discount_kind` dimension. |
| **Long ranges** (sales per month, this year) | **v1:** the server reads ranges over 93 days as ≤93-day chunks (sums add exactly; ratios recomputed from parts; distinct counts from a dedicated call), up to **13 months**. Closed months are cached in Redis (key = tenant + scope + month + definition version). **v2 (only if timings demand it):** a daily rollup table rebuilt per dirty business day, from `reporting.order_figures` so the definition stays single. |

### 5.4 One server read path for web **and** app

- `src/lib/reports/read/run-report.ts`: `ReportQuery` → engine/RPC calls → `ReportResult { rows, totals, compareTotals, coverage, meta }`.
- Web pages call it from Server Components with the cookie session.
- `POST /api/reports/query` (wrapped in `withRequestBearer`) serves the app the same object. The app's on-device Σtotal engines are retired for platform stores.
- The web Dashboard, Owl `get_sales_overview`, Branches and MCP `get_sales_summary` switch to it. **After this, "sales" is one number everywhere.**

### 5.5 Preferences

`report_preferences (tenant_id, user_id, overview_cards text[], saved_views jsonb, updated_at)`: RLS is the caller's own row only. The owner's choice is the store default for staff who haven't chosen. Cards follow the owner from web to app.

## 6. The surfaces

### 6.1 Overview (`/admin/reports`)
Wireframes are in `research/research-ux.md` §8.2.
- **Filter bar** (shared, every report):
  - Always visible: `[Last 7 days ▾] [vs previous ▾] [All branches ▾] [+ Filter]`.
  - Extra filters show as chips (order type, channel, payment, staff, category, weekday, hours).
  - Presets: Today, Yesterday, Last 7 / 30 days, This / Last week, This / Last month, This year, Last 12 months, Custom.
  - Compare options: previous period, same period last year, none. Short ranges compare to the same weekdays. With no earlier data the card says "No earlier data", never "+100%".
- **KPI cards**:
  - Default six: Sales, Orders, Average order, Avg customers/day, Profit % (if costs, else Money received), Items sold.
  - Each card shows its value, ▲/▼ ₱ and %, "vs ₱X", a sparkline with the comparison in grey and ⓘ.
  - **Edit cards** opens the metric library, which the owner can pin and reorder.
- **Sales over time**:
  - Metric tabs (Sales · Orders · Average order · Customers · Profit).
  - Grain chosen automatically (hour, day, week, month) and switchable.
  - Comparison drawn as a grey line, with a "Show as table" option.
  - Ranges ≥ 2 months default to **monthly bars**.
- **What changed**: up to 3 rule-based sentences ranked by peso impact, each showing its numbers and linking to the evidence ("Sales up ₱6,140, mostly Iced Spanish Latte (+₱2,300) → Items"). Extends `src/lib/reports/insights.ts`, which already exists. No AI-invented numbers.
- **Top items** (5), **Order types**, **Payments** share bars, then a "More reports" row.

### 6.2 Sales by day / month (`/admin/reports/periods`): the answer to "sales per month"
- One row per day, week or month (toggle), with a weekday column.
- Default columns: Orders, Customers, Sales, Average order, Items sold, Discounts, Cost of food†, Gross profit†, Profit %† († = needs `costs`).
- Column picker over every registry metric that is additive by period.
- Totals row using correct aggregation (sum / distinct / ratio), plus an "Average per day" row.
- Zero-sales days are shown, not skipped.
- This is the sheet accountants post from, so it maps 1:1 to the export's "Daily sales" sheet.

### 6.3 Items (`/admin/reports/items`): the reference table
Wireframe: `research/research-ux.md` §8.3.
- **Group**: Category › Item › Variation › Add-on (collapsible tree), or a flat list at any level.
- **Add-on prices**: "own rows" or "inside the item".
- **Columns** (presets plus custom):
  - **Simple**: Qty, Sales, Share
  - **Money**: + Gross, Discounts, Avg price
  - **Profit**†: + Cost of food, Gross profit, Profit %, Cost coverage
  - **Kitchen**: Qty, Qty/day, Attach rate
- Sticky header, totals row, sort on any column, search, "Show items with no sales".
- **Views**:
  - Table.
  - **By month** (pivot: rows = items, columns = months, cell = chosen metric).
  - **Menu matrix** on real profit % when costs cover ≥ 70% of sales; otherwise it says so and falls back to price.
- **Row drawer**: trend, variation mix, add-ons and their attach rate, "Picked together" (moved from Boost/Product Analytics), "See orders".
- On phones: a ranked list with a metric switcher and expandable variations; a Table toggle gives a frozen first column.

### 6.4 Other breakdowns (Categories, Channels, Hours, Payments, Branches)
They keep today's content, but each gains the shared table engine (column picker, sort, totals, export) and the shared filter bar. Hours gets a **weekday filter** and a metric switch (orders / sales / avg order) on the heatmap.

### 6.5 New: Discounts, Staff, Customers
- **Discounts**: ₱ and count by kind, discount rate, top vouchers and codes, and Senior/PWD totals linking to the book. Statutory discounts are labelled "required by law", so the owner isn't blamed for them.
- **Staff**: per cashier: orders, sales, average order, discounts given, cancellations. Shift view links to Cash & remits.
- **Customers** (`customers` key): regulars / first-timers / unnamed split, customers per day, came-back rate, best customers, favourites by segment, and "Bring them back" actions linking to Texts and Loyalty. It reuses `src/lib/customer-dashboard.ts`, so it's the same as the app.

### 6.6 Exports (`/admin/reports/export` + an Export button on every report)
- **The Export button on every report** opens a dialog that states exactly what's included ("42 items · Oct 1–31 · Drinks · 9 columns"). Formats:
  - **Excel** (default): a header block with store, period and filters; numeric cells, ₱ format, frozen header, autofilter.
  - **CSV**: UTF-8 with BOM so Excel shows ₱ and ñ; ISO dates; reuses the formula guard from `gov-discount-reports/csv.ts`.
  - **Print / PDF**: print stylesheet of the current report. v1 needs no PDF library.
- **Accountant pack** (XLSX, ≤ 13 months, one click from the Export page and the Overview `⋯` menu). Sheets:
  - Summary: gross → net waterfall, service, delivery, collected, unpaid, profit and coverage, plus a **Checks** block (Σ daily = summary, Σ items = net, Σ payments = collected).
  - Daily sales: one row per business day, a column per payment method and one per discount kind, COGS†, profit†.
  - Payments.
  - Discounts.
  - Senior/PWD book (reused from the gov-discount ledger).
  - Cancellations & refunds.
  - Items (with variations and add-ons, profit†).
  - Categories / Channels / Branches.
  - Orders (optional).
  - Definitions (from the registry).
- **VAT block**: VATable / VAT / VAT-exempt, driven by `store_tax_profiles`; non-VAT stores show no VAT lines. Labelled *"for your records; confirm with your accountant"*. No BIR-compliance claim until a PH accountant reviews it.
- **Rules**:
  - Exports run through `run-report.ts` with the caller's session, so RLS and permissions apply and cost columns are removed without `costs`.
  - Every export is logged in `report_exports` (who, what, period, filters, row count). A history list sits on the Export page.
  - Rate-limited per user.
  - Large packs are built in `after()` and stored in R2 behind a 24 h signed link, with a notification when ready.
- **Built on** `exceljs` (already a dependency) and the expenses workbook (`src/lib/expenses/export-workbook.ts`) as the pattern.

### 6.7 Familiarity and onboarding
- An ⓘ on every metric opens a sheet with: what it means, how it's counted, an example with the store's own numbers, and "where to see more".
- A first-visit 3-step tour of Reports (cards → filter bar → export), dismissible and remembered per user.
- Four empty states: no orders yet, no orders in this period, filter too narrow, no costs set up ("Add recipes to see profit →").
- A Learn lesson: "Reading your reports in 5 minutes" (`LearnChip` beside page titles).
- The Owl assistant can answer "why did sales drop?" by reading the same `ReportResult`. No new numbers.

## 7. Phased build (each phase shippable on its own)

**Order (owner, 2026-11-05): app first.** Phase 0 builds the shared server engine both clients read; then the merchant app gets the new reports (A1–A5); then the web (W1–W6).

| Phase | Scope | Ships | Size |
|---|---|---|---|
| **0a. Engine foundations** | Metric registry, `ReportQuery`, `run-report.ts` over the existing RPCs, 13-month chunking + Redis for closed months, `POST /api/reports/query` (bearer, `withRequestBearer`) + `report_preferences` migration. | Server (invisible) | L |
| **0b. SQL additions** | Filters on `reporting.order_figures`, `line_modifiers` + `report_sales_by_modifier`, item COGS, customers per period, staff dimension, discounts by kind — each with TS twin + parity test. | Server | L |
| **A1. App Overview + one period bar** | Reports tab hero → chosen KPI cards (Edit cards), sales over time (monthly grain), what changed, one `ReportPeriodBar` (presets, compare, branch, filter sheet). Home's sales tiles read the engine. | OTA | L |
| **A2. App Sales by day/month** | Period rows + column picker + totals/average rows. Replaces Analytics/Trends/Growth duplicates. | OTA | M |
| **A3. App Items tree** | Item › Variation › Add-on, attach rate, profit columns, by-month, drawer. Replaces Performance's on-device engine. | OTA | L |
| **A4. App breakdowns + new reports** | Categories, channels, hours (weekday filter), payments, discounts, staff, branches on the engine. | OTA | M |
| **A5. App exports + familiarity** | Server-built Excel/CSV/accountant pack shared from the phone; ⓘ sheets, tour, empty states. | OTA (EAS only if a new native module is needed) | M |
| **W1–W6. Web** | Overview + filter bar + sidebar restructure; table engine + periods; items tree; exports; new reports; familiarity (former Phases 1–6). | Web | L |
| **8. Later** | Scheduled email digests (needs outbound email), daily push summary, saved views, Z-style daily close, daily rollup table if timings demand it, Convex/tenant-DB coverage. | — | — |

Every phase is built **TDD** (registry contract tests, parity property tests for every new SQL twin, PGlite RLS runners per role, table-engine unit tests). It is verified on the **real platform DB** (timed probes on the largest store, ~6.9k orders/month; budget ≤ 0.6 s per call, ≤ 3 s for a 13-month chunked read). `npm run lint` and the code review agents run before each merge. Work happens on a worktree branch `feat/reports-redesign`, given the shared tree.

## 8. Risks

- **Shared DB load**: 13-month reads are up to 5 chunked calls per report. Mitigations: Redis for closed months, sequential chunks, timeouts, the measured budget above, and the rollup table as the escape hatch.
- **Signature changes to live report SQL**: only defaulted params are added; the parity and access tests pin behaviour.
- **Variation/add-on shapes**: older web orders have text only (no price). Those rows show "~" (estimated from today's menu price) instead of being silently wrong.
- **Refunds rewrite orders in place**: history can change after the fact. Exports state "as of <timestamp>"; the Z-style frozen close in Phase 8 is the real fix.
- **App binary**: if the app half needs a new native module (e.g. file save), it waits for the next EAS build. JS-only parts go OTA.

## 9. Decisions for the owner

1. **Structure**: fold Product Analytics, Profit and menu matrix under one **Reports** entry, keep Home as the live "Today" view, and rename the Stock "Reports" tab to "Daily stock check". *(Recommended)*
2. **KPI cards**: per person, with the owner's choice as the store default. *(Recommended)* Or one shared set per store.
3. **Language**: English labels + Taglish hints in helper text and ⓘ sheets. *(Recommended)* Or full Taglish labels.
4. **Order**: ~~web first~~ → **app first** (owner, 2026-11-05).
5. **Scheduled emails**: defer to Phase 8 because outbound email isn't set up. A daily push summary in the app could come sooner.
6. **Convex / tenant-DB stores**: new reports are platform-only for now; their current pages stay. *(Recommended)*
7. **Tax wording**: VAT block labelled "for your records". No BIR-compliance claim until a PH accountant reviews it. *(Recommended)*
