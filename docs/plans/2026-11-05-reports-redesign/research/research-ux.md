# WebNegosyo Reports: UX research and proposed design

Prepared 2026-11-05 · audience: product/design/eng · scope: web admin (`/[tenant]/admin/reports`) + merchant app Reports tab

Who this is for: owners of small Filipino food businesses. They are not analysts, they mostly use phones, and many speak Taglish. They want to "easily familiarize with everything". Every recommendation below is judged by one question: can an owner standing behind the counter answer "how did we do, and what should I do about it?" in under 10 seconds?

Some of this is already built. `src/components/admin/reports/` has `kpi-tile`, `delta-pill`, `metric-info`, `report-filter-bar`, `report-table`, `insight-card`, `hour-heatmap`, `trend-chart` and `share-bar`. Routes already exist for `/admin/reports`, `/admin/reports/[dim]` (items, categories, payments, channels, hours, branches) and `/admin/reports/profit`. Older overlapping surfaces still live alongside them: `product-analytics`, `menu-engineering`, `customers`, `cash`, `expenses`, `gov-discounts` and `inventory/log`. The proposals below reuse those parts rather than replacing them.

---

## 0. Ten principles (the short version)

1. **Answer first, chart second.** Show the headline number above its trend (Stripe's documented Dashboard pattern). The sentence or number comes before any axis.
2. **One question per page, one home per number.** Every metric has exactly one report that "owns" it. Every other place that shows it links there and never re-computes it. This matches the existing rule that revenue is defined only in `sales-model.ts`.
3. **Plain names, defined on tap.** Use "Average order", not "AOV". Every metric gets an ⓘ that explains what it is, how it's counted, and what's left out.
4. **Filters are global and live in the URL.** Choose a range once and it follows you from Overview to Items to export.
5. **Compare by default, but make it honest.** "vs last week, same days". Show "New" instead of "+∞%". Grey out the comparison when there's no history.
6. **Phones get ranked lists, desktops get tables.** On a phone, keep one primary metric visible plus a metric switcher. The full grid sits behind "Table view".
7. **Progressive disclosure: Overview → Report → Orders.** Every number can be tapped down to the orders behind it.
8. **Build insights from rules, not from the model.** Use deterministic "what changed" sentences that always come with their numbers. Never use a narrative-only claim the owner can't check.
9. **Export what you see.** The default scope is the current filters plus the visible columns, and the file has a header that states them.
10. **Accessible by construction.** Colour is never the only signal (▲▼ plus sign), every chart has a "Show as table" option, and touch targets are at least 44px.

---

## 1. Information architecture

### 1.1 What the research says

- **Overview → library → detail is the norm.** Shopify separates an *Overview dashboard* of customisable metric cards from *Analytics > Reports*, a library of pre-built reports. Cards open their report through a "View report" icon, though not every card has a report and not every report has a card. Toast has *Reports > Sales > Sales summary* and *Reports > Menus > Product mix*. Square has Reports with fixed reports plus a Custom Report builder.
- **Separate operational from analytical views.** NN/g distinguishes *operational* dashboards (live, glance and act) from *analytical* ones (look back, think). Owners need both. "Today" is operational, while reports are analytical. Don't mix live-ticking numbers into a "Last month" view.
- **A known way overlap goes wrong:** Toast PMIX "net sales" differs from Sales Summary because PMIX excludes service charges and tips and dates refunds to the original sale. Two pages showing two "net sales" figures is the single biggest trust-killer in POS reporting. WebNegosyo already guards against this with one sales model, and the IA should keep it that way by giving each number a single home.
- **Keep the top level small.** Metabase advises at most 3 visible filters per dashboard. NN/g's preattentive guidance favours few, simple visuals. The same "few things, chosen well" logic applies to navigation: 5±2 report groups.

### 1.2 Proposed sitemap

The sidebar gets **one** entry, **Reports** ("Benta at ulat" as an optional subtitle). Everything below lives under `/[tenant]/admin/reports`.

```
Reports  (/admin/reports)
│
├── Overview                      ← dashboard: chosen KPI cards, trend, "what changed", top items
│                                    (today's live view = Home/Orders, not here)
├── Report library                ← /admin/reports/all : every report as a card, grouped, searchable,
│                                    "Pinned" row on top
│
├── SALES  ("Benta")
│   ├── Sales summary             /reports/summary     gross → discounts → net → service/delivery → collected
│   ├── Items                     /reports/items       item → variation → add-on; ?view=matrix (by month)
│   ├── Categories                /reports/categories
│   ├── Order types & channels    /reports/channels    dine-in/pickup/delivery × web/POS/QR/Grab/foodpanda
│   ├── Busy hours & days         /reports/hours       heatmap hour × weekday
│   ├── Payments                  /reports/payments    cash, GCash, card, unpaid, overpaid
│   ├── Discounts & vouchers      /reports/discounts   incl. Senior/PWD totals (link to the book)
│   ├── Staff & shifts            /reports/staff       sales per cashier/shift (attribution derived)
│   └── Branches                  /reports/branches    (only multi-branch, store-wide accounts)
│
├── PROFIT  ("Kita")              (needs `costs`)
│   ├── Profit overview           /reports/profit
│   ├── Item profit & food cost   /reports/items?cols=profit   ← a column preset, NOT another page
│   └── Expenses                  → existing /admin/expenses (linked, not duplicated)
│
├── CUSTOMERS  ("Suki")
│   ├── Regulars & first-timers   /reports/customers   (= app Reports tab content)
│   ├── Best customers            /reports/customers/best
│   └── Loyalty & texts results   /reports/loyalty
│
├── STOCK  ("Imbentaryo")         (needs `inventory`; ₱ values need `costs`)
│   ├── Stock on hand & value     /reports/stock
│   ├── Usage, waste & variance   /reports/stock/usage
│   └── Movement log              → existing /admin/inventory/log
│
└── MONEY & BOOKS  ("Pera")
    ├── Cash drawer & shifts      → existing /admin/cash (linked)
    └── Senior/PWD sales book     → existing /admin/gov-discounts (compliance, linked)
```

**How the old pages fold in (dedupe map)**

| Existing surface | Becomes | Why |
|---|---|---|
| `/admin/product-analytics` | Redirect → `/reports/items` (platform). Keep for Convex/tenant-DB until Phase 7 | Same question ("what sold?") |
| `/admin/menu-engineering` (BCG matrix) | A **view** of Items: `/reports/items?view=menu-matrix`. Boost Sales stays the *action* page | A view of the same data, not a separate report |
| Profit page per item | Column preset "Profit" on Items | One table and one set of numbers. The `costs` key hides the columns |
| `customers` hub numbers | Customers group | Already the app's Reports tab |
| "Picked together" (Boost + Product Analytics) | Section inside Items detail drawer + Boost | Shown twice today |

**Rules that stop pages from overlapping**

- A new page needs a new **question**. A new filter or column is a view (`?view=`, `?cols=`), not a page.
- Each metric has an `ownerReport` in the metric registry (see §3.4). Cards and insights link to `ownerReport` with the current filters.
- Cross-links read "See it in Items →", never a copy of the table.

### 1.3 Naming (owner words, with an optional Taglish hint)

| Analyst term | Label | ⓘ one-liner (EN · Taglish hint) |
|---|---|---|
| Net sales | **Sales** | What you earned from food after discounts · "Benta matapos ang discount" |
| Gross sales | Sales before discounts | |
| AOV | **Average order** | Sales ÷ orders · "Average na gastos bawat order" |
| Transactions | **Orders** | |
| COGS | **Cost of food** | What the ingredients cost, from your recipes |
| Gross margin % | **Profit %** | Of every ₱100 sold, how much is left after food cost |
| Food cost % | Food cost % | Keep as-is, since restaurant owners know it |
| PMIX | **What sold** (page: Items) | |
| Void / refund | Cancelled / Money returned | |
| Collected | **Money received** | |
| Unpaid / AR | **Still to collect** | |
| Variance (stock) | Missing / extra stock | |
| Cohort / retention | **Came back** | |

Labels are in English (the menu and POS already are). Taglish goes in helper text, ⓘ sheets and insight sentences, routed through the existing label system so a future full-Filipino locale is a copy change. **Test with 3–5 owners** before committing to Taglish copy. Mixed-language UI can read as patronising if it's overdone.

---

## 2. Global filter bar

### 2.1 Findings

- **Presets plus custom, with compare inside the date control.** Stripe puts date presets in the first dropdown and the comparison range in another. Shopify's date menu offers "previous period" or "same dates last year". GoodData builds compare into the date filter and **disables** it for "All time". Adobe offers prior period, same period last year, or custom. For a 14-day custom range, the only presets are "prior 14 days" and custom.
- **Few visible filters.** Metabase recommends at most 3. Toast shows Date, Compare and Location in the top bar, with item tags, sales category, employee and order source under **More filters**, each one *pinnable* to the top bar, plus an explicit **Apply filters** button.
- **Chips.** The Linear-style pattern is chip = attribute + value ("Branch: Makati"). Clicking a chip edits it in place, each chip has its own ✕, and "Clear" applies per filter. PatternFly: one filter trigger type per page, and chips are labelled with attribute and value.
- **Apply timing.** Apply live on desktop, and use confirm-before-apply inside a modal sheet (phones) so results don't jump behind the sheet.
- **Linked filters.** Metabase: a child filter narrows by its parent (Category → Item). Wire them in the right direction.
- **URLs and saved views.** Metabase puts filter values in the URL, so a bookmark works as a "saved view". Square custom reports *can't* save date filters, which users complain about.
- **Accessibility.** The bar is a `role="search"` region, and the result count is in `aria-live="polite"`.

### 2.2 Recommendation

**Anatomy (desktop):** `[Date ▾] [Compare ▾] [Branch ▾]  [+ Filter]   chips…   [Export] [⋯]`

**Date presets.** All of these use the store's business day: Asia/Manila, with the end-of-day cutoff from settings. Most cafés close after midnight, so the cutoff matters.
`Today · Yesterday · Last 7 days · Last 30 days · This week · Last week · This month · Last month · This year · Custom…`
- "This month" means month to date. Label it as "Nov 1–5" so the partial period is visible.
- Custom is limited to ≤93 days, the SQL bound that's already in place. A longer request suggests the monthly matrix view or an export instead.

**Compare:** `Previous period (default) · Same period last year · Same days last week · None`.
- For ranges of 1 day or less, compare to the **same weekday last week**, not yesterday. A Saturday compared with a Friday will always look like a spike.
- A partial period is compared to the **same elapsed span** ("Nov 1–5 vs Oct 1–5", not all of October).
- If the comparison period predates the store's first order, show "No earlier data" and keep the control disabled. Never show "+100%".

**More filters (sheet):** Order type · Channel · Payment method · Staff/cashier · Category → Item (linked) · Customer type (regular/first-time). Each can be pinned to the bar, and the pins are remembered per user (browser storage is fine for that).

**Scope rules**
- Branch: a branch-locked account sees a **static chip** "Branch: Cubao 🔒" that can't be removed (the existing `report-context` behaviour). The URL can't override it.
- Single-branch stores never see a Branch filter. Stores without Grab/foodpanda never see those channels. Hide filters that have no options.

**URL schema** (short, readable, relative tokens so bookmarks stay "live"):
```
?range=last7 | today | mtd | 2026-10-01..2026-10-31
&cmp=prev | yoy | wow | none
&branch=<slug>[,<slug>]
&type=dine_in,pickup  &ch=pos,web,qr  &pay=gcash  &staff=<ref>  &cat=<id>  &item=<id>
&cols=sales,qty,avg,profit   &sort=-sales   &group=item|variation|addon   &view=table|matrix
```
- Navigating between reports keeps every global key (`range`, `cmp`, `branch`, `type`, `ch`, `pay`, `staff`). Report-specific keys (`cols`, `group`, `view`) are dropped.
- Store **relative** tokens (`last7`). An absolute range appears only when the user picks custom dates.

**Saved views: phase 2 (YAGNI for v1).** In v1, "Pin report" saves report + filters + columns as a card in the library's Pinned row. That covers about 80% of "saved views" without a view manager. Add named, shareable views only if owners ask.

---

## 3. KPI cards

### 3.1 Findings

- Stripe: headline value above the chart, a sparkline inline with a KPI for direction ("shape, not numbers"), a 180px compact chart and a 320px featured chart, and at most three charts in a row. Charts become unreadable below about 200px wide.
- Shopify: **Customize** opens a *Metrics library* sidebar where you add (⊕ or drag), remove (⊗) and reorder (⠿) cards. Saved explorations can be pinned as cards, and cards with a report show "View report".
- Square Dashboard app widget: pick the metrics and drag to reorder.
- Polaris Viz convention: current period in the brand colour, comparison in **grey**.
- GA4 anomalies use progressive disclosure: hollow bubble → hover summary → insight card.

### 3.2 Card anatomy

```
┌──────────────────────────────┐
│ Sales                    ⓘ   │  ← label + definition
│ ₱48,210                      │  ← value, tabular-nums, ₱ formatted
│ ▲ ₱6,140 (+14.6%)            │  ← delta: absolute first, % second, arrow + sign (not colour only)
│ vs ₱42,070 last week         │  ← states the comparison in words
│ ╱╲_╱‾‾╲╱‾  (grey = last week)│  ← sparkline 24px; comparison line grey/dashed
└──────────────────────────────┘   whole card = link to its owner report, filters kept
```

**Delta rules**
- Good/bad colour comes from the metric's `goodDirection`: up is good for Sales, down is good for Food cost % and Cancelled. Metrics with no clear good direction (Orders at a fixed-capacity kitchen, Average order) use neutral ink.
- If the base is 0, show "New". If both values are 0, show "—". Below a minimum base (for example under 5 orders), show the delta greyed with "Too few orders to compare".
- Round the percentage to whole numbers above ±10% (`+15%`), and use one decimal below that.

**Default cards (6, in priority order):** Sales · Orders · Average order · Money received (or Still to collect if > 0) · Profit % (if `costs`) · Regulars %.

### 3.3 "Choose what you track"

- `[Edit cards]` opens a **Metrics library** (sheet on phone, side panel on desktop). Metrics are grouped (Sales / Profit / Customers / Stock) and each shows its ⓘ and a live preview value. Add/remove happens with a toggle. Reorder by drag on desktop, and with ↑↓ buttons on phone, which are more reliable than drag on touch and keyboard-accessible.
- Store selections **per user**. Use a DB row, not localStorage, so they follow the owner between web and app. Store a 4–8 card limit, plus "Reset to suggested".
- **Goals (optional, owner-set):** "Daily sales goal ₱20,000" turns the card into a progress meter (`72% of goal · ₱5,600 to go`). Never suggest a goal number from the system. That's consistent with the onboarding rule "never promises a number". Goals apply to Today/This week/This month and are hidden for custom ranges.

### 3.4 Metric registry (the thing that makes all of the above consistent)

One typed map drives cards, table columns, the ⓘ sheet, export headers and insight wording:

```ts
interface MetricDef {
  key: 'net_sales' | 'orders' | 'avg_order' | 'qty' | 'profit' | 'profit_pct' | ...
  label: string            // "Sales"
  short: string            // "Sales" (table header, ≤2 words — Carbon)
  definition: string       // ⓘ text
  includes?: string[]      // "Discounts are taken off", "Service charge NOT included"
  format: 'peso' | 'count' | 'percent'
  goodDirection: 'up' | 'down' | 'neutral'
  permission: 'reports' | 'costs' | 'inventory' | 'customers'
  ownerReport: ReportSlug
}
```

**ⓘ sheet content:** what it is (1 line) · how it's counted (formula in words) · included/not included · tiny worked example ("10 orders, ₱2,500 → ₱250 average") · "See it in [owner report] →".

---

## 4. Data tables for reports

### 4.1 Findings

- **Toast PMIX, the closest reference:**
  - A hierarchy drop-down chooses levels (menu / group / item / modifier / subgroup). One level gives a flat list, and several give a nested, collapsible table with expand-all on the first header.
  - A **Columns** button adds avg price, discounts, waste, void and, with costs set, COGS, gross profit and margin.
  - A **Show percentages** toggle shows each row's share of its parent.
  - A modifier price option either folds modifiers into the item's average price or shows them as separate rows.
  - "Hide rows with no data" is on by default.
  - Compare puts two periods in adjacent columns. Export is Excel/CSV.
- **Square:** customise columns, and export "selected columns only" or all. This didn't work on every report, and users notice the inconsistency.
- **Carbon:**
  - Column titles are 1–2 words.
  - Only the sorted column shows a sort icon (others appear on hover), with `aria-sort`.
  - The toolbar has at most about 5 actions, with the rest in an overflow menu.
  - Toolbar height matches row height.
  - Expand-all is available as an option.
- **NN/g mobile tables:**
  - Lock the header and the first column.
  - Let users choose which attributes show.
  - Give visible horizontal-scroll cues (a cut-off column, not dots).
  - Never force landscape.
- **Cards versus tables:** cards suit reading one record at a time, and a scrolling table suits comparing down a column. With more than about 6 columns, use cards/collapsible rows or column priority plus a scroll fallback.

### 4.2 Recommendation: Items report as the reference implementation

- **Columns (picker)**, grouped, with presets:
  - **Simple** (default): Qty sold · Sales · % of sales
  - **Money:** + Avg price · Discounts · Gross sales
  - **Profit** (`costs`): + Cost of food · Profit · Profit %
  - **Kitchen:** Qty · Cancelled · Waste (if inventory)
  - **Compare:** each chosen metric gets "Last period" and "Change" sub-columns when Compare is on (limit to 2 metrics on phones)
  - A custom set saves to URL `cols=` and becomes the default for that user.
- **Group by:** `Item` (default) / `Item › Variation` / `Item › Variation › Add-on` / `Add-ons only` / `Category › Item`. Expand-all sits in the first header.
- **Add-on attribution toggle** (Toast lesson): "Add-on prices: [Inside item] [Own rows]". Default is *Own rows* so ₱ add-on revenue is visible. Totals must reconcile either way, using the engine's existing line scaling.
- **Totals row pinned at the top**, directly under the header (sticky with it), so it's visible without scrolling 80 items. Label it "All items (42)". Σ rows = total, exactly, which the sales model already guarantees.
- **Sorting:** by Sales descending by default. Clicking a header toggles; only the active column shows ▲/▼.
- **Numbers:** right-aligned, `tabular-nums`, ₱ without decimals unless the range is ≤ 1 day, and inline share bars (existing `share-bar`/`bar-cell`) for % of sales.
- **Zero rows:** "Show items with no sales" is off by default. Turning it on is how owners find dead menu items, so the toggle stays visible.
- **Pivot / matrix view** (`?view=matrix`, exists): rows = items, columns = months/weeks/days chosen by range length, cells = the one chosen metric (single metric only, picked with a chip), with a heatmap tint plus the numbers.
- **Row drill:** clicking an item opens a **side drawer** (desktop) or **full sheet** (phone) with a trend, variations, add-ons, "picked together", and "See orders →" (filtered order list).

**Phone table strategy (hybrid):**
1. Default is a **ranked list**: rank · name · ONE primary metric with a share bar · secondary metric in small text. A metric switcher chip row (`Sales | Qty | Profit`) changes the primary metric and the sort.
2. Tapping a row expands it inline to variations/add-ons (accordion), and "Details" opens the sheet.
3. A `Table view` toggle shows a horizontal-scroll grid with a **frozen first column**, sticky header and a visible cut-off column as the scroll cue.

---

## 5. Insights, narrative, empty states, onboarding

### 5.1 Findings

- Power BI Smart Narrative: text summary plus expected ranges, but mostly descriptive.
- GA4: anomaly markers on the chart, with progressive disclosure to an insight card.
- Amplitude Dashboard Agent: "what changed between runs, and why it matters".
- Zoho Zia: text view paired with chart view.
- Practitioner advice: an anomaly flag with no explanation "creates anxiety, not action". Account for seasonality. Never drop the numbers, because narrative-only products lose trust.

### 5.2 Recommendation

**Use rule-based insight cards (deterministic, testable, Taglish-ready templates).** These are not LLM output. The Owl assistant can *explain* them on request.

| Rule | Trigger | Sentence template |
|---|---|---|
| Big mover (period) | \|Δ\| ≥ 15% and ≥ ₱1,000 and base ≥ 10 orders | "Sales are **up ₱6,140 (+15%)** vs last week. Most of it came from **Iced Spanish Latte (+₱2,300)**." |
| Driver decomposition | Δ sales explained by orders vs average order | "You had **18 more orders**; average order was about the same." |
| Best/worst seller | top/bottom by Δ qty among items with ≥ 5 sold | "**Tapsilog** sold 40% less than usual." |
| Busy hour shift | peak hour moved ≥ 2h | "Your busiest hour moved to **7–8 PM** (was 12–1 PM)." |
| Unusual day | day outside ±2σ of same-weekday last 8 weeks | "**Saturday** was your best Saturday in 2 months." |
| Unpaid money | unpaid > 0 | "**₱1,250 still to collect** from 3 orders → See orders" |
| Missing setup | no recipes/costs | "Add food costs to see profit. Takes ~5 min → Set up" |

Rules for insights:
- At most 3 on Overview, ranked by ₱ impact.
- Each card shows its numbers and an "evidence" link (opens the report with filters already set).
- Each card has a "Not useful" ✕ so it can be dismissed.
- Compare same weekdays.
- Suppress insights when the data is too thin (fewer than N orders), and say so once: "Not enough orders yet for tips. Check back after ~20 orders."

**Empty states (four distinct ones, never a blank chart).** Stripe: same height as the populated chart, loading → error → empty → populated, in that priority order.
1. *No orders ever*: Owl (merchant-side is allowed) plus "Your first sale will show up here" plus "Share your store link" CTA.
2. *No orders in this range*: "No orders Nov 1–5" plus quick buttons: [Last 30 days] [All of this year].
3. *Filters exclude everything*: "No orders match **GCash · Delivery**" plus [Clear filters].
4. *Feature not set up / no permission*: "Profit needs food costs" (CTA) / "Ask the owner for access to costs" (no CTA).

**First-run tour (Overview, once per user, skippable, 3 steps max):**
1. "This is your range. Tap to see last month or any day." → date control
2. "Tap any number to see what's behind it." → first KPI card
3. "Want different numbers here? Edit cards." → Edit cards

Afterwards a `LearnChip` beside the title links to the University lesson. Re-open the tour from ⋯ → "Show me around". Respect `prefers-reduced-motion`.

**Progressive disclosure ladder:** Overview card → report (table) → row drawer → order list → order. Every level keeps filters and has a back affordance that restores scroll position.

---

## 6. Export, schedules, print

### 6.1 Findings

- Square: export → gear → "selected columns only" or all (inconsistent across reports). Custom reports export only and can't be printed. The daily sales summary email is set under Settings → Notifications, sends only on days with sales, the send time follows end-of-day, and the fields can't be customised.
- Toast PMIX: Excel/CSV, **cannot be scheduled**. That's a gap WebNegosyo can fill.
- Export UX write-ups:
  - State the scope in the dialog ("1,240 rows matching your current filters").
  - Default to the filtered view and the visible columns.
  - Pick columns in the dialog itself.
  - Keep column settings consistent across formats.
  - Include a filter summary in the file.
  - Send large exports in the background or by email instead of a long spinner.
  - Excel needs UTF-8 with a BOM.
- GitLab: the export button became a menu offering "All records" or "Matching current filters".

### 6.2 Recommendation

**Export dialog**
- **What:** this report as shown (default) · or raw lines (every order line, for accountants).
- **Rows:** "42 items · Nov 1–5 · Branch: Cubao · GCash" with a live count. Option: "Ignore filters (all items, same dates)".
- **Columns:** checklist pre-ticked with the visible columns. `costs` columns appear only with permission (export must not leak what the screen hides).
- **Format:**
  - **Excel** (default for owners/accountants): header block with store, range, filters, generated-at and "Amounts in ₱". Numbers stay numeric. Totals row. One sheet per group level is optional.
  - **CSV:** raw, UTF-8 BOM, ISO dates, numbers without ₱ and without thousands separators.
  - **PDF / Print:** the page's print stylesheet (A4 portrait, filter summary on top, the chart *and* the table, page numbers). Owners print Z-reading-like summaries.
- **Large exports** (more than about 5k rows): "We'll prepare it and notify you" goes to the bell or email. Never leave a long spinner.
- **Filename:** `smartcafe_items_2026-11-01_to_2026-11-05_cubao.xlsx`.

**Scheduled summaries ("Send me a daily report")**
- Phase 1 is **one** schedule type: the Daily summary after closing (end-of-day cutoff). It contains yesterday's Sales, Orders, Average order, top 3 items, unpaid, and 1–2 insight sentences, all linking back.
- Channels: email first. App push ("Yesterday: ₱18,400 · ▲12%") is a strong fit for phone-first owners. Messenger or SMS go later, because of cost and Meta's rules.
- Settings: recipients (owner plus up to N), weekly variant (Monday), "send even on zero-sales days" toggle (Square's users complained about silent days).
- Phase 2: scheduled export of any report as Excel.

---

## 7. Accessibility and phone layout of charts

- **Chart type follows the question:**
  - Line for "going up or down?"
  - Bar for "how much each?" (starts at 0)
  - A single horizontal meter/stacked bar for "breakdown of a total"
  - Sparkline only as direction
  - **Avoid** pies with more than 3 slices, gauges, 3D and treemaps on dashboards (NN/g preattentive: position and length read fastest; angle and area read slowest).
- **Sizes:** compact 180px, featured 320px, at most 3 per row, never narrower than about 200px. Loading, empty and error states keep the same height so the layout doesn't jump.
- **Phone:**
  - Charts are full-width, one per row.
  - Use at most about 7 x-axis labels (auto-thin: daily → "Mon 3", weekly → "Nov 3", monthly → "Nov").
  - Abbreviate ₱ on the axis (₱12k), with full values in the tooltip.
  - **Tap-and-drag scrubbing** shows a crosshair and a tooltip *above* the finger, avoiding fat-finger occlusion. Tap outside to dismiss.
  - Never rely on hover.
- **Colour:**
  - Current period = brand accent, comparison = grey/dashed (Polaris convention).
  - Up/down is shown with ▲▼ and a sign, never colour alone.
  - Check contrast at least 3:1 for marks and 4.5:1 for text, in light and dark.
  - Use a colour-blind-safe categorical palette for channels/payments, with direct labels in place of legends where possible.
- **Screen readers:**
  - Each chart has `role="img"` with an `aria-label` summary sentence ("Sales by day, Nov 1–5, highest Saturday ₱14,200").
  - A **"Show as table"** toggle renders the same data as a real `<table>` with `<caption>`, `<th scope>`, `aria-sort` (Carbon).
  - The filter bar is `role="search"`, with result/total updates in `aria-live="polite"`.
- **Touch:** targets of at least 44×44 (Material: 48dp), chips at least 36px high with an 8px gap.
- **Motion:** chart enter animations ≤ 200ms and none under `prefers-reduced-motion`.
- **Numbers:** `tabular-nums` everywhere, en-PH formatting (`₱48,210`), dates as "Nov 5" or "Nob 5" depending on locale.

---

## 8. Wireframes

### 8.1 Filter bar

**Desktop (≥1024px)**
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [📅 Last 7 days · Oct 30–Nov 5 ▾] [vs Previous 7 days ▾] [🏪 All branches ▾] [+ Filter] │
│  ( GCash ✕ )  ( Delivery ✕ )  Clear all                     42 items  [⤓ Export] [⋯]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
   chips = "attribute value"; click a chip → small popover editor; changes apply live
```

**Date popover (desktop)**
```
┌───────────────────────────────────────────────────────────────┐
│ Today            │      October 2026          November 2026   │
│ Yesterday        │  Su Mo Tu We Th Fr Sa   Su Mo Tu We Th Fr Sa│
│ ● Last 7 days    │               1  2  3   [1][2][3][4][5] 6 7 │
│ Last 30 days     │  ...         [30][31]    8  9 ...           │
│ This week        │                                              │
│ Last week        │  Compare to:                                 │
│ This month       │  (•) Previous period   Oct 23–29             │
│ Last month       │  ( ) Same days last year  Oct 30–Nov 5, 2025 │
│ This year        │  ( ) None                                    │
│ Custom…          │                              [Cancel] [Apply]│
└───────────────────────────────────────────────────────────────┘
```

**Phone (≤640px)**: one scrollable chip row, sticky under the page title
```
┌─────────────────────────────────┐
│ Items                     [⤓][⋯]│
│ [Last 7 days ▾][vs prev ▾][⚙ 2] │ ← ⚙ 2 = "Filters (2 on)" opens sheet
└─────────────────────────────────┘

 Filters sheet (bottom sheet, confirm-before-apply)
┌─────────────────────────────────┐
│ ───                              │
│ Filters                 Clear all│
│ Branch        All branches     › │
│ Order type    Delivery         › │
│ Payment       GCash            › │
│ Channel       All              › │
│ Staff         All              › │
│ Category      All              › │
│                                  │
│ [      Show 42 items        ]    │ ← count updates live, applies on tap
└─────────────────────────────────┘
```

### 8.2 Overview dashboard

**Desktop**
```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ Reports                                                   [Learn ▸]  [Edit cards]      │
│ [Last 7 days ▾] [vs Previous 7 days ▾] [All branches ▾] [+ Filter]          [⤓] [⋯]    │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│ Sales     ⓘ  │ Orders    ⓘ  │ Avg order ⓘ  │ Received  ⓘ  │ Profit %  ⓘ  │ Regulars ⓘ  │
│ ₱48,210      │ 193          │ ₱250         │ ₱47,100      │ 61%          │ 38%         │
│ ▲₱6,140 +15% │ ▲18 +10%     │ ▲₱10 +4%     │ ₱1,110 unpaid│ ▼2 pts       │ ▲3 pts      │
│ ╱╲_╱‾╲╱‾     │ _╱‾╲_╱‾      │ ‾‾╲_╱‾‾      │ ╱‾‾╲╱‾       │ ‾╲__╱‾       │ _╱‾‾╱       │
├──────────────┴──────────────┴──────────────┴────┬─────────┴──────────────┴─────────────┤
│ Sales by day                      [Sales ▾]      │ What changed                          │
│ ₱                                                │ ▲ Sales up ₱6,140 (+15%) vs last wk.  │
│ 14k ┤            ▇                               │   Most from Iced Spanish Latte        │
│     ┤      ▇     ▇  ▇                            │   (+₱2,300).            See items →   │
│  7k ┤ ▇ ▇  ▇  ▇  ▇  ▇  ▇    ░ = last week        │ ● ₱1,110 still to collect from 3      │
│     └──────────────────────                      │   orders.              See orders →   │
│      Th Fr Sa Su Mo Tu We         [Show as table]│ ● Busiest hour moved to 7–8 PM.       │
├──────────────────────────────────────────────────┼───────────────────────────────────────┤
│ Top items                         See all →      │ Order types        Payments           │
│ 1 Iced Spanish Latte  ███████████ ₱8,400  96     │ Dine-in  ██████ 54%  Cash  █████ 48%  │
│ 2 Tapsilog            ███████     ₱5,200  52     │ Pickup   ███   27%   GCash ████  41%  │
│ 3 Ube Cheese Pandesal █████       ₱3,900 130     │ Delivery ██    19%   Card  █     11%  │
│ 4 Caramel Macchiato   ████        ₱3,100  31     │                       See payments →  │
├──────────────────────────────────────────────────┴───────────────────────────────────────┤
│ Reports  ·  Sales summary  Items  Categories  Hours  Payments  Discounts  Staff   All →  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Phone**
```
┌─────────────────────────────────┐
│ Reports                 [✎][⋯] │  ✎ = Edit cards
│ [Last 7 days ▾][vs prev ▾][⚙]  │
├─────────────────────────────────┤
│ Sales                        ⓘ │  ← hero card full width
│ ₱48,210                         │
│ ▲ ₱6,140 (+15%) vs ₱42,070     │
│ ▁▂▅▃▇▆▄  (grey: last week)     │
├────────────────┬────────────────┤
│ Orders       ⓘ │ Avg order    ⓘ │  ← 2-up grid for the rest
│ 193  ▲18       │ ₱250  ▲₱10     │
├────────────────┼────────────────┤
│ Received     ⓘ │ Profit %     ⓘ │
│ ₱47,100        │ 61%  ▼2 pts    │
│ ₱1,110 unpaid ›│                │
├────────────────┴────────────────┤
│ What changed                    │
│ ▲ Sales up 15%, mostly Iced     │
│   Spanish Latte.        Items › │
│ ● ₱1,110 still to collect  ›    │
├─────────────────────────────────┤
│ Sales by day      [Sales|Orders]│
│ ▇ ▇ ▇ ▇ ▇ ▇ ▇   (drag to read)  │
│ Th Fr Sa Su Mo Tu We            │
├─────────────────────────────────┤
│ Top items              See all ›│
│ 1 Iced Spanish Latte  ₱8,400 ▲  │
│   ███████████  96 sold          │
│ 2 Tapsilog            ₱5,200 ▼  │
│   ███████      52 sold          │
├─────────────────────────────────┤
│ More reports                    │
│ [Sales summary] [Items] [Hours] │
│ [Payments] [Staff] [All reports]│
└─────────────────────────────────┘
```

### 8.3 Report detail: Items (variations and add-ons)

**Desktop**
```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ ‹ Reports   Items                                          ⓘ What counts as "Sales"?  [⤓] │
│ [Last 30 days ▾] [vs Previous 30 days ▾] [All branches ▾] [+ Filter]  ( Drinks ✕ )         │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ View: [Table] [By month] [Menu matrix]   Group: [Item › Variation › Add-on ▾]              │
│ Add-on prices: (•) Own rows ( ) Inside item    □ Show items with no sales   [⚙ Columns ▾]  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⊞  Name                         Qty ▾    Sales      % of sales   Avg price   Δ Sales       │ ← sticky
│    All items (42)               1,204   ₱148,900   ████ 100%     ₱124        ▲ +9%         │ ← pinned total
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ⊟  Iced Spanish Latte             312    ₱42,120   ██▌ 28%       ₱135        ▲ +18%        │
│    ├ ⊟ 16 oz                      201    ₱27,135       18%       ₱135        ▲ +22%        │
│    │   ├ + Extra shot              64     ₱1,920        1%        ₱30                      │
│    │   └ + Oat milk                22       ₱880        1%        ₱40                      │
│    └ ⊞ 22 oz                      111    ₱14,985       10%       ₱135        ▲ +11%        │
│ ⊞  Tapsilog                       208    ₱31,200   ██ 21%        ₱150        ▼ −6%         │
│ ⊞  Ube Cheese Pandesal            520    ₱13,000   █ 9%          ₱25         ▲ +3%         │
│ ...                                                                                        │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Showing 42 of 42 · Totals include add-ons · Cancelled orders excluded           Page 1 of 1│
└────────────────────────────────────────────────────────────────────────────────────────────┘
  click a row name → right drawer: trend 320px, variations, add-ons, "Picked together", See orders →
```

**Phone (ranked list default, Table view toggle)**
```
┌─────────────────────────────────┐
│ ‹ Items                  [⤓][⋯]│
│ [Last 30 days ▾][vs prev ▾][⚙1]│
├─────────────────────────────────┤
│ Sort by: (Sales) Qty  Profit  ⚙ │ ← metric switcher = primary metric + sort
│ Show: [Items ▾]   [List|Table]  │
├─────────────────────────────────┤
│ All items · ₱148,900 · 1,204 sold│ ← total
├─────────────────────────────────┤
│ 1  Iced Spanish Latte    ₱42,120│
│    ██████████▌ 28%  312 sold ▲18%│
│    ▾ 2 sizes · 3 add-ons        │ ← tap = expand inline
│    ├ 16 oz   ₱27,135   201      │
│    │  + Extra shot ₱1,920  64   │
│    └ 22 oz   ₱14,985   111      │
│    [See details ›]              │
├─────────────────────────────────┤
│ 2  Tapsilog              ₱31,200│
│    ███████▌ 21%   208 sold ▼6%  │
├─────────────────────────────────┤
│ 3  Ube Cheese Pandesal   ₱13,000│
│    ███ 9%         520 sold ▲3%  │
└─────────────────────────────────┘

 Table view (horizontal scroll, frozen first column, cut-off cue)
┌─────────────────────────────────┐
│ Name             │ Qty  │ Sales │ % of│  ← next column cut off = scroll cue
│ All items        │1,204 │148.9k │ 100 │
│ Iced Spanish L…  │  312 │ 42.1k │  28 │
│ Tapsilog         │  208 │ 31.2k │  21 │
│ Ube Cheese Pan…  │  520 │ 13.0k │   9 │
└─────────────────────────────────┘
```

### 8.4 Column picker

**Desktop (popover from ⚙ Columns)**
```
┌──────────────────────────────────────┐
│ Columns                        Reset │
│ Presets: (Simple) Money Profit Kitchen│
├──────────────────────────────────────┤
│ SALES                                │
│ ☑ Sales                         ⠿ ⓘ  │
│ ☐ Sales before discounts        ⠿ ⓘ  │
│ ☐ Discounts                     ⠿ ⓘ  │
│ ☑ % of sales                    ⠿ ⓘ  │
│ ☐ Avg price                     ⠿ ⓘ  │
│ QUANTITY                             │
│ ☑ Qty sold                      ⠿ ⓘ  │
│ ☐ Cancelled                     ⠿ ⓘ  │
│ PROFIT                     🔒 costs  │ ← group hidden or locked without permission
│ ☐ Cost of food                  ⠿ ⓘ  │
│ ☐ Profit                        ⠿ ⓘ  │
│ ☐ Profit %                      ⠿ ⓘ  │
│ COMPARE (when Compare is on)         │
│ ☑ Change vs last period              │
├──────────────────────────────────────┤
│ 4 of 12 selected      [Save as default]│
└──────────────────────────────────────┘
  ⠿ drag to reorder (also ↑/↓ with keyboard); Name column is always first and can't be hidden
```

**Phone (bottom sheet)**
```
┌─────────────────────────────────┐
│ ───                             │
│ Choose what to show       Reset │
│ [Simple] [Money] [Profit]       │
│                                 │
│ Sales                    [●──]  │ ← toggles
│ Qty sold                 [●──]  │
│ % of sales               [●──]  │
│ Avg price                [──○]  │
│ Discounts                [──○]  │
│ Profit            🔒     [──○]  │
│                                 │
│ Tip: on a phone, 3 columns fit  │
│ without scrolling.              │
│ [           Done            ]   │
└─────────────────────────────────┘
```

### 8.5 Export dialog

**Desktop (modal)**
```
┌─────────────────────────────────────────────────────────────┐
│ Export Items                                             ✕  │
├─────────────────────────────────────────────────────────────┤
│ What's included                                             │
│   42 items · Oct 7 – Nov 5, 2026 · All branches · Drinks    │
│   compared with Sep 7 – Oct 6                               │
│   ( ) Ignore filters (all categories, same dates)           │
│                                                             │
│ Detail                                                      │
│   (•) As shown  (items › sizes › add-ons, with totals)      │
│   ( ) Every order line (for your accountant)  ~3,940 rows   │
│                                                             │
│ Columns   Name, Qty sold, Sales, % of sales, Change  [Edit] │
│                                                             │
│ Format                                                      │
│   (•) Excel (.xlsx)  Best for opening and printing          │
│   ( ) CSV            Raw data for other apps                │
│   ( ) PDF            A snapshot to share or print           │
│                                                             │
│ ☑ Add a header with store name, dates and filters           │
├─────────────────────────────────────────────────────────────┤
│ smartcafe_items_2026-10-07_to_2026-11-05.xlsx               │
│                                    [Cancel]  [⤓ Download]   │
└─────────────────────────────────────────────────────────────┘
  > 5,000 rows → button becomes [Prepare & notify me]; done → bell + email link
```

**Phone (full-height sheet)**
```
┌─────────────────────────────────┐
│ ‹ Export Items                  │
├─────────────────────────────────┤
│ 42 items                        │
│ Oct 7 – Nov 5 · All branches    │
│ Drinks                          │
│                                 │
│ Format                          │
│ ┌─────────┐┌─────────┐┌───────┐ │
│ │ ● Excel ││  CSV    ││  PDF  │ │
│ └─────────┘└─────────┘└───────┘ │
│                                 │
│ Detail          As shown      › │
│ Columns         5 columns     › │
│ Header          On            › │
│                                 │
│ [     ⤓ Download Excel      ]   │
│ [  Share…  ] (opens share sheet: │
│   Messenger, Email, Drive)      │
│                                 │
│ ── Every day ────────────────── │
│ Get a daily summary after       │
│ closing             [Set up ›]  │
└─────────────────────────────────┘
```

---

## 9. Suggested phasing (design-side)

1. **Foundations:** metric registry (§3.4), global filter URL schema and carry-over (§2.2), ⓘ sheet, empty states. These touch every report.
2. **Overview v2:** chosen cards (per-user), "What changed" rules, top items, report shortcuts, first-run tour.
3. **Items v2:** group by variation/add-on, add-on toggle, column picker and presets, pinned totals, phone ranked list. Then roll the table component out to the other breakdowns.
4. **Report library and dedupe:** `/reports/all`, pins, redirects for product-analytics/menu-engineering.
5. **Export dialog and daily summary** (email + app push).
6. **Merchant app parity:** the same registry and URL-equivalent state. The app Reports tab keeps its customer-first hero and gains the Sales/Items entries.

Each phase must ship on **platform Supabase first** and read through the existing report RPCs. New metrics need SQL twins with parity tests. Nothing here changes the definition of a number.

---

## 10. Open questions for the owner

1. Taglish in UI copy: helper text only, or a full Filipino toggle?
2. Should goals exist at all in v1? They're simple to build, but they add a settings surface.
3. Daily summary channel priority: email or app push first? Messenger later?
4. Is the menu matrix (BCG) still wanted as a view, or does Boost Sales cover it?
5. Per-user card choice versus one per store (shared by owner and staff)?

---

## Sources

- Stripe, Chart layout for Stripe Apps (headline above chart, heights, ≤3 per row, chart states): https://docs.stripe.com/stripe-apps/patterns/chart-layout
- Stripe, Dashboard home page charts (edit overview, compare range): https://support.stripe.com/questions/customize-your-dashboard-home-page-charts-for-better-business-insights
- Shopify Help, Overview dashboard (Customize, Metrics library, View report): https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard
- Shopify changelog, Customize your analytics dashboard: https://changelog.shopify.com/posts/customize-your-analytics-dashboard-to-focus-on-key-business-metrics
- ShopifyQL COMPARE TO: https://shopify.dev/docs/api/shopifyql/latest/syntax/compare-to
- ShopifyQL metric card web component: https://shopify.dev/docs/api/shopifyql/latest/web-components/metric-card
- Shopify community, Polaris Viz deprecated: https://community.shopify.dev/t/polaris-viz-depreciated-alternative-or-ok/13062
- Toast, Product Mix (PMIX) Report Overview: https://support.toasttab.com/en/article/Product-Mix-PMIX-Report-Overview
- Toast, Menu Report Overview: https://support.toasttab.com/en/article/Menu-Report-Overview-1492794696577
- Square, Creating custom reports: https://squareup.com/help/us/en/article/6104-creating-custom-reports-in-the-online-dashboard
- Square Community, Exporting only selected columns: https://community.squareup.com/t5/Square-Point-of-Sale/Exporting-only-selected-columns-in-a-custom-report/m-p/751939
- Square, Print, export or email your reports: https://squareup.com/help/ca/en/article/8362-print-export-or-email-your-reports
- Square, Get started with the Square Dashboard app: https://squareup.com/help/article/5618-get-started-with-the-square-dashboard-app
- Square Community, Sales email reports (no zero-sales days): https://community.squareup.com/t5/Reports-Setup-Management/Sales-email-reports/m-p/833220
- Loyverse, Sales by item report: https://help.loyverse.com/help/sales-item-report-back-office
- Loyverse, Exporting data: https://help.loyverse.com/help/exporting-data-from-loyverse-account
- NN/g, Dashboards: Making Charts and Graphs Easier to Understand: https://www.nngroup.com/articles/dashboards-preattentive/
- NN/g, Mobile Tables: https://www.nngroup.com/articles/mobile-tables/
- Carbon, Data table usage: https://carbondesignsystem.com/components/data-table/usage/
- Carbon, Data table accessibility: https://carbondesignsystem.com/components/data-table/accessibility/
- Carbon, Accessibility for developers (charts + table alternative): https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/developers
- Metabase, Linked filters: https://www.metabase.com/docs/latest/dashboards/linked-filters
- Metabase, Dashboard filters (≤3 filters): https://www.metabase.com/docs/v0.46/dashboards/filters
- Power BI, Smart narrative: https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-smart-narrative
- GA4, Anomaly detection: https://support.google.com/analytics/answer/9517187
- Amplitude, Dashboard Agent: https://www.amplitude.com/docs/ja/amplitude-ai/dashboard-agent
- GoodData, Time-over-time comparison: https://help.gooddata.com/classic/en/dashboards-and-insights/analytical-designer/work-with-metrics/time-over-time-comparison/
- Adobe, Date ranges and comparisons in Analysis Workspace: https://experienceleague.adobe.com/docs/analytics-learn/tutorials/analysis-workspace/calendar-and-date-ranges/date-ranges-and-calendar-in-analysis-workspace.html?lang=en
- Stripe Apps, Filter controls: https://docs.stripe.com/stripe-apps/patterns/filter-controls
- PatternFly, Filter: https://pf3.patternfly.org/v3/pattern-library/forms-and-controls/filter
- Ubuntu design system, search and filter patterns: https://discourse.ubuntu.com/t/3-types-of-search-and-filter-patterns/21507
- SaaS UI, Data export/download UX patterns: https://www.saasui.design/blog/saas-data-export-download-ux-patterns
- GitLab issue, export reflects current filters: https://gitlab.com/gitlab-org/gitlab/-/issues/352075
- Responsive tables (scroll vs stacked): https://sizzy.co/blog/responsive-tables · https://medium.com/@YunTan/design-responsive-tables-5ad73a54508f
- Mobile exploratory visualization interaction (arXiv 2404.11602): https://ar5iv.labs.arxiv.org/html/2404.11602
- Material tooltip (touch) spec mirror: https://www.mdui.org/en/design/1/components/tooltips.html

Caveats: I couldn't fetch the official Polaris data-viz page (it redirects to shopify.dev and Polaris Viz is archived). The Linear and Vercel filter patterns come from secondary write-ups. Baymard's table research wasn't directly accessible. Treat those points as strong conventions, not citations.
