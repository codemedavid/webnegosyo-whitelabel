# Competitor research: how restaurant POS / commerce products structure analytics & reports

Prepared 2026-11-05 for the WebNegosyo analytics/reports redesign.
Scope: Toast, Square (for Restaurants + Dashboard + Custom Report Builder + Square AI), Loyverse, Lightspeed (Restaurant K-Series, Advanced Insights, Retail X-Series), Shopify (new analytics, 2025), Clover, TouchBistro, Revel, StoreHub (SEA/PH), UTAK and Mosaic (PH).

**Confidence key.** Facts marked as coming from a vendor's own help centre are high confidence. Facts from third-party reviews, comparison blogs or forums are marked *(3rd-party)*. Where help pages were silent I say so instead of guessing. Sources are at the end.

---

## 0. TL;DR

1. **Every leader uses the same three layers.** (a) A *home/overview* of 4 to 8 KPI tiles, each with a % change against a comparison period, where tapping a tile opens its report. (b) A *report library* grouped by business question (Sales, Menu/Items, Payments, Team/Labor, Customers, Inventory/Cost). (c) An *escape hatch* for power users: a custom report builder, CSV/XLSX export, and lately an AI prompt.
2. **The "product mix" (PMIX) report is the core of restaurant reporting.** Toast's is the best reference. It is one table with a hierarchy selector (menu → group → item → modifier), so one report answers category, item and add-on questions. It has a "% of parent" toggle, column picker, cost/profit columns that appear only when costs exist, a single-metric compare mode, and pinned filters.
3. **Comparison is the default, not a feature.** Toast's weekly overview compares against last week, same week last year (SWLY) or two years back. Toast's weekly email adds "same day last week" (SDLW) and a 4-week same-weekday average. Shopify defaults to "today vs yesterday" and lets you switch to previous period or last year. Square has a "Sales trends" two-period overlay.
4. **Profit appears only when costs exist, and the screen says so.** Toast PMIX shows COGS, gross profit and gross margin only if costs are set up. Shopify's "Profit by product" quietly *drops* uncosted products, which is an anti-pattern. Loyverse puts Cost of goods / Gross profit / Margin directly in Sales summary, Sales by item and Sales by category.
5. **Variations and modifiers are handled poorly almost everywhere.** Toast treats sizes as modifier rows with no size filter. Square nests variations under the item row and ignores modifier hierarchy. StoreHub has a separate "Sales by Variant" report whose totals don't reconcile with item sales. Clover's docs barely cover modifiers. This is a real gap WebNegosyo can win on.
6. **Owners are angriest about numbers that disagree between reports.** Toast PMIX net ≠ Sales Summary net. Square custom-builder "Total sales" ≠ legacy reports. Shopify add-to-cart counts differ between reports. StoreHub variant totals ≠ product totals. Our one-definition sales model (`src/lib/reports/sales-model.ts`) is a competitive advantage. The UI should *show* that totals reconcile.
7. **Explainers.** Square has a "help mode" that shows the definition of any metric. StoreHub has a "?" tooltip with the formula. Shopify has data-issue icons, auto "insights" and metric *targets*. Toast publishes "which report to use when" (first day, weekly, monthly). Square AI and Shopify Sidekick turn plain-language questions into reports, and Square lets you pin the result as a dashboard widget.
8. **Scheduled email is rare and valued.** Toast only has fixed daily/weekly performance emails, and PMIX can't be scheduled. Square's Daily Sales Summary goes to the owner only, isn't customisable and skips zero-sales days. Square's Custom Report Builder (newer) schedules any saved report daily, weekly, monthly or quarterly. Forum threads keep asking for this.

---

## 1. Toast

### Information architecture
- Left nav **Reports** opens the **Weekly Overview** dashboard. An arrow (>) expands the full list of **40+ reports in 9 categories**: Sales, Labor, Menus, Payments, Cash & Loss Management, Accounts, Kitchen Operations, Marketing, Other. Some categories appear only when a module is active (Kitchen Ops requires the KDS). A missing report is usually a permission or module issue.
- Key reports: **Sales Summary** (Reports > Sales > Sales summary, also under homepage "Quick actions"), **Sales Breakdown** (cross two sales dimensions, e.g. dining option × revenue center), **Hourly Sales** (sales and labor in 15-minute intervals), **Location Overview** (multi-unit), **Product Mix (PMIX)** (Reports > Menus > Product mix), **Top Modifiers**, **Modifier Details**, **Item Details**, **Top Menu Items** (has an employee filter), **Labor Summary**, **Guest Information**, Deposits, Cash Activity Audit.
- The Performance Center page was retired on 2025-09-29 and folded into the Sales Summary's **Dining Option Summary** card. Toast is *consolidating* reports.

### Default dashboard (Weekly Overview)
- Refreshes hourly and runs on a weekly cycle (This week / Last week).
- KPI tiles: **Net Sales**, **Labor Cost** ($ and % of sales), **Guest Count**, **Top 7 Selling Items** (avg daily qty, net sales, % change). Every tile links to its full report.
- Compare: prior week, same week last year, same week two years ago. Every section shows % change.
- No widget customisation.

### Sales Summary
- 17 "Sales Summary Cards", which can be reordered with the gear icon. Examples: Revenue Summary, Net Sales Summary (gross − discounts − refunds = net), Service Mode Summary (net sales, guests, avg per guest, orders, turn time per mode), Dining Option Summary, Tax Summary, Deferred (gift cards), Tips, Payments, Voids.
- Built like an accountant's statement. Toast calls it the most-used report and recommends exporting it at month end for the accountant.

### PMIX (the reference implementation)
- **Filters:** date (presets plus custom, *no range limit*), Compare (off by default), Location (group or single). A "More filters" panel holds item tags, sales categories, employee and order source. **Any filter can be pinned** to the top bar.
- **Hierarchy selector:** menus / menu groups / subgroups / items / modifiers / special requests. Pick one level for a flat ranking, or several for a collapsible tree with an expand-all arrow.
- **Columns button:** sales category, avg price, discounts, waste count, void amount and more. Default headers are Qty sold, Gross item amount and Net item amount. Click a header to sort.
- **Cost columns:** COGS, gross profit and gross margin appear *only if cost data exists* (Menu Manager or xtraCHEF).
- **"Show percentages" toggle:** each row's share of its *parent* level, or of all items when Items is the only level.
- **Modifiers and sizes:** modifiers are separate rows. Sizes are also modifier rows, with no size filter. A setting controls whether item price includes modifier revenue ("calculate item prices including / without modifiers").
- **Compare mode:** two periods side by side for ONE chosen metric (qty, gross, net, discounts, refunds, voids, waste, price, tax, …).
- **Settings:** "aggregate by name" merges same-named items across menus. "Hide rows with no data" is on by default.
- **Export:** Excel or CSV, using the columns on screen. **It cannot be scheduled**, and Toast's own article confirms it is a feature request.
- **Definitions** are documented, including *why PMIX net differs from Sales Summary net* (excludes service charges, tips and unlinked refunds, and books refunds to the original sale date).
- **Known gaps** (Toast's own list): no payment-type filter, no size filter, no per-employee item view, **no day-of-week filter** (Toast tells you to export and pivot), no scheduled email.

### Filters (general)
Time frame (day, week, month, custom), **hour-of-day filter** (preset or custom), employee, location (multi-select), and "More": dining option, revenue center, service area. Comparison views are Compare Dates (prior period or same period last year) and Compare Locations, colour-coded blue vs orange.

### Export & scheduling
- Column changes carry into exports. "Email Export" sends a download link (.xls/.csv) to comma-separated addresses. Print to PDF goes through the browser. There is also a nightly automated data export (SFTP).
- **Daily Performance Summary email**, fixed at 9 a.m. ET: previous business day's net sales, gift card sales, orders, guests, avg per order and per guest.
- **Weekly Performance Summary email:** sales, guests, avg order, spend per guest, hourly labor, voids, deferred, breakdowns by service type, revenue center, sales category, order type and order source. Compares **SDLW, SWLY and a 4-week same-weekday average**, plus a **revenue forecast for next week**.
- Recipients come from email lists and must hold the sales-report permission. No custom POS reports (Toast: "not possible").

### Benchmarks
"Toast Benchmarking" compares a location with an AI-selected peer cohort (menu, sales, ticket size, traffic), suppressed when the cohort is too small. Includes a service-performance report and table-turn time by hour vs peers. The plan tier sets the cohort scope.

### Onboarding/explainers
Toast publishes "reporting best practices" articles by cadence: first day on Toast, then weekly (Labor Summary, Hourly Sales, Location Overview, Deposits), then monthly (Sales Breakdown, Location Overview, Sales Summary vs prior period). This "what to look at and when" framing is worth copying.

### Reviewer sentiment
- Complaints: "reports are not as easy as they could be to break down", "don't like the way reports and options are displayed", "legacy reports gave better information", "report generation that they couldn't trust", owners going back to the "previous version" of reports for accounting after Toast changes them, confusing permissions. *(3rd-party: Capterra, Trustpilot, r/ToastPOS)*
- Praise: depth, multi-location views, PMIX detail.

---

## 2. Square (Dashboard, Square for Restaurants)

### Information architecture
- **Reports** list: Sales summary, Sales trends, Payment methods, Item sales, Category sales (with **category rollups**, e.g. beer + wine + cocktails = "Alcoholic beverages"), Modifier sales, Discounts, Comps, Voids, Taxes, Service charges, Gift cards. Add-ons with a subscription: Team sales (Staff), Section sales (Restaurants Plus/Premium, by floor-plan area), Kitchen performance (KDS: ticket count, avg ticket time), Labor vs sales, COGS (Retail Plus).
- **Live Sales** for restaurants: open checks can be included in most sales reports. Open checks are included by default and can be toggled off.
- **Custom reports (legacy):** stack "blocks" (key stats, sales summary, payment methods, item, category, team, discounts, modifiers, taxes) into one saved page. Date filters can't be saved, and the page isn't visible in the POS app.
- **Custom Report Builder (new):** Reports > Custom tab. Presets by topic: Sales (summary, by location, **by time of day**), Items (item, category, modifier), Team (member sales, labour summary), Payments (methods, fees), Taxes, **Cost of goods (COGS summary)**, Restaurants (**kitchen performance, table turn**), Loyalty, Gift cards, Other (comps & voids, online orders, discounts). Build from scratch by picking **metrics** (gross, net, item qty, total sales, total collected …), **groupings** (item, category, location, team member, customer) and **filters** (date, location, category). Other features:
  - **Compare** to the prior week or month.
  - Table, bar or line view toggle.
  - Nested categories (up to 3 levels) get automatic subtotals.
  - **Forecast** shows a day-by-day projection with a confidence band.
  - **Schedule** delivery daily, weekly, monthly or quarterly at a chosen time and time zone, emailed as an attachment.
  - An **AI prompt box**: "Show me sales year over year" auto-selects the metrics, groupings and filters.
  - Export is capped at **10,000 rows**. Web only.
  - Square warns that some metrics are calculated differently from legacy reports.

### Default KPIs
- Web dashboard Net Sales widget: gross sales, average sale, transactions, returns. It compares today with the same day last week and shows the % change.
- App home: net sales, gross sales, transactions, average sale, with a "vs." control.
- iOS home-screen widget: gross, net, transactions, average sale.
- Gotcha: the Home tab defaults to *gross*, while Reports default to *net*. *(3rd-party summary)*

### Sales summary
- Laid out "like a balance sheet": Product sales → service charges → discounts & comps → returns → **Net sales** → taxes → **Gross sales** → tips → gift card sales → **Total sales** → fees → **Total collected** → Net total.
- Starred metrics can be charted (line or bar).
- Controls sit in a right-hand "blade":
  - Date, with a **custom workweek**.
  - Report type: summarise by group, hour or day, in increments of hours, days, weeks or months.
  - Location: one or all.
  - **Group metric by:** location, device, source, channel, collected-by, revenue center.
  - **Filter by:** timeframe, channel, device, source, collected-by, revenue center.
- The POS app keeps only 90 days of reporting and offers "View in Dashboard" for more.
- **Sales trends:** two periods overlaid, picking one of gross sales, avg total sale, net sales or order count.

### Items, variations, modifiers
- Item sales: name, qty sold, gross, net, SKU, discounts. Can be grouped by discount name × item. **Clicking an item expands its variations.** Archived items are kept.
  - Gotcha: **renaming an item, modifier, discount or tax creates a separate row in reporting.**
- Modifier sales: top modifiers for a period. Negative "no bacon −$2" modifiers show as negative revenue. **Nested modifier hierarchy isn't reflected** (beta).
- Category sales: category totals plus item count. Rollups group categories.
- COGS (Retail Plus): cost, revenue, profit and margin per item variation. Can include all stock adjustments or sales only.
  - Complaints: no sort by best or worst (alphabetical only), tax-inclusive costs distort margin. *(Square Community)*

### Explainers
- **Help mode** shows metric definitions inside the report.
- Glossary articles, which differ by region: the US "gross sales" includes tax, Canada's doesn't. That is confusing in itself.

### Email
- **Daily Sales Summary:** a checkbox under Account & Settings → Email notifications. Sent an hour after business close. Owner only, can't be delegated, can't be customised, and **not sent on zero-sales days**. *(Square Community)*
- Custom Report Builder schedules cover everything else.

### Square AI (2025)
- Natural-language Q&A over sales, transactions, staff, labor and customers.
- Saved conversation history.
- Oct 2025: **pin AI-generated charts as dashboard widgets** that update in near real time.
- Adds "neighbourhood context" (weather, events, reviews).

### Reviewer sentiment
- Praise: ease of use, fast setup.
- Complaints: "reporting has limitations", "back of house reporting is a disaster", no weekday-vs-weekend or hour-by-weekday comparisons (requested repeatedly), the Sales Trends report can't be exported, and exports summarise without per-day rows. *(Capterra, G2, Software Advice, Square Community)*

---

## 3. Loyverse (popular with PH micro-merchants)

### Information architecture
Back Office → **Reports**: Sales summary (the default landing page), Sales by item, Sales by category, Sales by employee, Sales by payment type, Receipts, Sales by modifier, Discounts, Taxes, Shifts. Advanced Inventory adds Inventory history and Inventory valuation.

### Sales summary
- **Filters:** Today, Yesterday, This week, This month, Custom. Also stores (multi), employees (multi), and **time of day** ("All day" off → start/end times; documented on the category report and in the Dashboard app).
- **Metric tabs**, each compared with the previous equivalent period: Gross sales, Refunds, Discounts, **Net sales (= gross − discounts − refunds)**, **Gross profit (= net − cost of goods)**. Clicking a tab charts it (area or bars) at **hourly, daily, weekly, monthly, quarterly or yearly granularity**.
- A day-by-day table underneath has a **column picker**.
- Definitions on the help page are precise: gross uses pre-discount prices, includes modifier prices, and includes tax only when tax is built into the price.

### Sales by item
- Top 5 items by net sales shown as a chart (bar, line or pie; grouped hours to years), then a table.
- Columns: SKU, category, items sold, gross, items refunded, refunds, discounts, net, **cost of goods, gross profit, margin**, taxes. Columns can be shown or hidden and the table sorted by any column.
- How variants appear is not documented. From product knowledge (unverified this session), variants show as separate rows like "Item (Variant)".

### Other reports
- Sales by category: items sold, net, COGS, gross profit.
- Sales by modifier: how often each option is selected. Columns are not documented.
- Receipts: a list with All / Sales / Refunds quick filters. A side panel shows the receipt (items, taxes, discounts, payment, device, employee, customer).

### Export & paywall
- CSV on every report.
- **The free plan is limited to 31 days of history and no export.** Paid "Unlimited Sales History" (about $5/month) unlocks both.
- Reviewers resent paying to download reports. *(Trustpilot)*

### Dashboard app
- Today's receipts, net sales, **average ticket**. Chart compares with the previous day.
- Pinch-zoomable bars, tap a bar for its value.
- Store switcher, custom time-of-day, drill into items, categories and employees.
- Stock alerts.

### Reviewer sentiment
- Praise: accurate, real-time, simple. Capterra 4.8 from 457 reviews.
- Complaints: "far fewer report types than other systems", "not thorough nor customizable", "wanted to set own criteria", COGS shifted when unit costs changed (costs not frozen at sale time), exports mangle accented characters in Excel (an encoding/BOM issue). *(Capterra, GetApp, G2)*

---

## 4. Lightspeed

### Restaurant (K-Series)
- Two places: the **Sales dashboard** (graphs and stats) and the **Reports page** (every report).
- Reports: Sales Summary (top bar of gross sales and orders without a cover; breakdowns by accounting groups, order profiles (top 5), payments, discounts & comps, taxes; *later added sales by day of week and by hour*), Product Mix (by accounting group, order profile, statistical category, product), Products (qty, cost, profit), Hourly performance (compare periods by hour), Business Report, Fiscal Summary, Staff report, Checks (last 28 days, no custom range).
- Export to CSV or XLSX, plus print.

### Advanced Insights
A paid add-on in some regions.
- **Item popularity:** items can be "rolled up" into custom subcategories.
- **Magic Menu Quadrant:** a scatter of **popularity × repeat-customer retention**, giving *Greatest Hits, Hidden Gems, One-Hit Wonders, Underperformers*. It has a table (category, order volume over the last 12 months, % of customers who returned, time between visits), a category filter, show-names, and an hourly hover (avg net sales, transactions, avg sale, repeat visits).
  - Notably the classification is based on *retention*, not margin. This is a creative alternative to the BCG/Kasavana-Smith menu matrix.
- **Server report cards:** top performers, upsell results, coaching opportunities.
- Daily Digest, Campaigns impact (sales and visits vs your own average), Guest Book.

### Advanced Reporting (separate module)
Templates plus a build-your-own option. A "custom table" can aggregate per receipt or per day. Export to PDF or Excel (some sections to CSV).

### Retail X-Series
Sales, inventory, payments and tax reports can be customised with **Report type, Measure, Date range, Comparison, Filters** and saved ("Save report" or "Save to existing report"). Advanced/Enterprise plans only. Lightspeed Analytics (retail) uses measures and dimensions, plus "filter by field" from a left-hand field list.

---

## 5. Shopify (new analytics, default since June 2025)

### Information architecture
Analytics has three layers:
1. **Dashboard** of metric cards.
2. **Reports library**, filterable by "Created by: Shopify" vs custom. Third-party sources describe categories such as Sales, Customers, Acquisition, Finances, Inventory, Profit.
3. **Explorations** (custom reports) and the ShopifyQL editor.

Nearly every card has a report behind it ("View report" icon), and every saved exploration becomes a card.

### Dashboard
- Cards can be **added, removed, reordered and resized**, and grouped into **named sections** (Aug 2025). A Metrics library sidebar shows each card's chart type.
- **Defaults to today vs yesterday.** The Compare dropdown switches to previous period or same period last year, and the % change is shown.
- **Automatic insights** highlight trends. **Metric targets** track progress toward goals. Data is under a minute old.

### Report builder (explorations)
- A configuration panel: **metrics**, **dimensions** (several allowed, shown nested or flat), **comparison** (period or target), **filters** (quick filters at the top plus a filter section), and a **visualization** menu (a recommended chart is auto-picked; line charts need a time dimension).
- The data table has a **Summary (totals) row at the top** and a Flat/Nested toggle.
- Date presets include Last 7 days, Month to date, and *seasonal presets* (BFCM). Default 30 days; cohort reports default to 12 months.
- Editing a default report is temporary until **"Save as"**.
- **Data-issue icons** (info, warning, critical) explain gaps.
- **Sidekick** turns questions into ShopifyQL, with "business-friendly explanations of what each report measures".

### Profit
- "Profit by product" and "Profit by product variant SKU" show gross profit = net sales − COGS, with margin = GP ÷ net sales.
- **Products without a recorded cost at the time of sale are silently left out.** Costs are effectively frozen at sale.
- No expenses beyond COGS.

### Reviewer sentiment (Shopify Community, 2025)
- "Fragmented": data that was on one report is now split across several.
- Conflicting metrics between reports ("both cannot be correct").
- A missing tax-by-county report turned a 10-minute task into 2 hours.
- Finance Summary turned into charts that bookkeepers find useless.
- Slower, "overcomplicated", old reports reachable only by URL.
- Shopify conceded "printing isn't available at the moment".
- **Lesson: power-user flexibility must not replace the plain, printable accountant reports owners already rely on.**

---

## 6. Clover, TouchBistro, Revel

- **Clover:**
  - **Sales Overview** shows orders, gross, net, **average ticket**, amount collected and top tender types. It compares with prior periods and the **same month last year** in side-by-side numbers.
  - Filters: time period, employee, **order type**, **order source**, device.
  - Item & Service sales and an Items report (top sellers with YoY, product-class filter, most returned, most discounted). Default reports don't break items down by day, so you export.
  - Modifier reporting isn't documented. Print and export on every report.
  - "Clover Insights" became "Main Street Insights". Reviewers cite a lack of customisation and up to 24-hour data delays. *(3rd-party)*
- **TouchBistro:**
  - In-app plus Cloud reporting: Sales Totals, Daily Sales, Sales by Section, Sales by Category, Full Day Snapshot, Sales Item Totals, Waiter Sales Item Totals, Void report, food cost and inventory menu reports.
  - Notably **"Modifier Preference by Menu Item"** shows which modifiers are chosen with each item. This is the "attach rate" view, useful for pruning modifiers and for inventory.
  - Date picker defaults to Today (midnight to midnight). Many reports export to CSV.
- **Revel:**
  - Product Mix with a "**top 10 by profit**" filter. The profit graph appears only when product costs are entered.
  - Sales Summary (daily detail incl. fees, discounts, taxes, liabilities, payments). A reporting API exposes sales/payment summaries, hourly sales and PMIX. *(Revel blog 2018, dated)*

---

## 7. Southeast Asia / Philippines

- **StoreHub (MY/PH):** the most relevant regional benchmark.
  - Reports menu:
    - Sales over time, grouped by hour, day, week or month.
    - **Sales by Product** (sales, **cost, profit**).
    - Sales by Product Category.
    - **Sales by Variant** and **Sales by Product SKU**.
    - **Sales by Transaction Channel** (in-store vs online: Beep delivery, QR Order & Pay, webstore, delivery-app integrations).
    - Payment Method.
    - Offline and Online Transactions.
    - Shifts (Z-reading), Employee Performance.
    - Stock Value / Stock Loss.
    - A separate **BIR** menu (POS report, e-journal, Z-reading) for PH tax compliance.
  - Blog "7 reports":
    - Best Selling Products: total sales, total sold, sale/item, cost/item, **Total GP %**; filters for supplier, category and tags.
    - Daily Sales: net, rounding, service charge, tax, total tendered, GP %, transactions, **net sales per transaction**.
    - Hourly Sales: avg sales and transactions per hour across 24h, plus an hourly *trend* across days.
    - Categories pie chart; Variants % share by product or category; Payment options; Stock value.
  - **Filters:** a "Filters" button builds Field / Condition (is, is not) / Value rules. Active filters show as removable chips with "Clear filters". You can **"Save as" a named saved filter**. Order Type (Takeaway / Dine-in) is a filter. **Group by** store, Daily, Weekly, Monthly, **Hour of Day, Day of Week**, and several groupings can be stacked.
  - Default range Month to date.
  - Export CSV or Excel, no PDF. Large exports are emailed.
  - **"?" tooltip beside a metric shows how it is calculated.**
  - Limits: ranges over 10 to 12 months can time out (run month by month), 2-year retention, and **variant totals don't match product/category totals** (the help centre admits it).
  - Accounting sync: QuickBooks, Xero.
- **UTAK (PH):** cloud POS from ₱1,500/month. Marketing claims real-time sales reports with graphs, sales and *expenses*, a central multi-branch dashboard, and an owner app. There are no public docs. UTAK employs a "product training specialist" to help clients interpret reports, which suggests the reports aren't self-explanatory. *(3rd-party/vendor)*
- **Mosaic (PH):** the back office lists Product Mix, Daily Sales Revenue, Hourly Sales Revenue, Transactions, Discount and Void reports. Its analytics are customisable dashboards at **brand/outlet** level with franchise roll-ups (company → franchisee → location), delivery-app and e-commerce consolidation, and "Resto iQ" menu engineering (sales volume vs COGS). *(vendor marketing)*

---

## 8. Cross-product comparison matrix

| Capability | Toast | Square | Loyverse | Lightspeed | Shopify | StoreHub |
|---|---|---|---|---|---|---|
| Home KPI tiles w/ % change | Yes (weekly) | Yes | Yes (today vs yesterday) | Sales dashboard | Yes, customisable | No clear dashboard |
| Customisable dashboard | No | Pin AI widgets | No | No | **Yes (cards, sections, resize)** | No |
| Compare period | Prior / SWLY / 2y | Prior wk/mo; trends overlay | Previous period | Yes (X-Series) | Prev period / last year / **target** | Not documented |
| Hour-of-day filter | Yes | Yes (summary) | Yes | Hourly report | Via dimension | Group by Hour of Day |
| Day-of-week | **No** (export) | Weekday list in summary | No | Added to Sales Summary | Via dimension | **Group by Day of Week** |
| Branch filter | Multi-select + compare locations | One/all | Multi | Per location | n/a | Single branch |
| Channel / order type | Dining option, order source | Channel, source | No | Order profiles | Sales channel | Transaction channel, order type |
| Employee | Yes | Yes | Yes | Staff report | Staff (POS) | Employee performance |
| Payment method | Payments report | Payment methods | Sales by payment type | Payments | Payments | Payment method |
| Variations | As modifier rows | Expand under item | Rows (assumed) | – | Variant SKU reports | Separate report (doesn't reconcile) |
| Modifiers/add-ons | Rows in PMIX + Top Modifiers | Modifier sales (flat) | Sales by modifier | Not documented | n/a | Not documented |
| Column picker | Yes | Yes (custom) | Yes | Yes | Yes (metrics) | Not documented |
| % of total | **Yes (of parent)** | No | No | No | Via metric | Variant/category % |
| COGS / GP / margin | If costs exist | Paid COGS report | **Built into every sales report** | Products report | Profit reports (drops uncosted) | Product report + GP % |
| Custom builder | No | **Yes + AI + forecast** | No | Add-on | **Yes (explorations, ShopifyQL, Sidekick)** | Saved filters + group-by |
| Export | CSV/XLS, email link | CSV/XLSX, 10k cap | CSV (paid) | CSV/XLSX/PDF | Export | CSV/XLSX, emailed if large |
| Scheduled email | Fixed daily/weekly digest | Daily summary + **any saved report** | No | – | No | No |
| Metric definitions in UI | Help articles | **Help mode** | Help articles | – | Data-issue icons, Sidekick | **"?" tooltip with formula** |
| Benchmarks / insights | **Peer benchmarks**, forecast | AI + local context | – | Magic Quadrant | Auto insights + targets | – |

---

## 9. What this means for WebNegosyo (context mapping)

The owner asks are: sales per month, profit, AOV, average orders/day, average customers/day, items sold, variation (size/flavour) sales, add-on sales, more filters.

- **Monthly sales:** Toast, Square and Loyverse all answer this with a period chart whose granularity can be switched (hour, day, week, month, quarter, year) and a table *underneath with one row per period*. Loyverse's metric tabs + granularity + table is the simplest well-tested version.
- **Profit:** Loyverse's model (GP column next to net sales everywhere) is what micro-merchants understand. Toast's "only when costs exist" rule prevents fake 100% margins. Our ledger already freezes costs (`order_item_costs`, `stock_movements.unit_cost`). Show coverage the way Shopify doesn't: "Profit covers 82% of sales. 6 dishes have no cost. Add costs".
- **AOV / per-day averages:** Toast's weekly email shows avg per order, avg per guest and guests. Square shows avg sale and transactions. Nobody puts "average orders per day" and "average customers per day" on the home screen, yet PH owners ask exactly that. Express it as "per open day" (Lightspeed already ranks per trading hour in our branch view).
- **Variations and add-ons:** competitors treat these badly. Toast flattens sizes into modifiers, Square ignores hierarchy, StoreHub's numbers don't reconcile. We already scale lines to the order total (Σ items = net exactly). We can ship an **Item → Variation/Option group → Option** tree with "% of parent" and attach rate ("41% of Lattes had an add-on, avg +₱28"). That is a differentiator.
- **Filters:** the union competitors converge on is date preset plus custom, compare, branch, channel/order type (dine-in, pickup, delivery, POS, QR, Grab/foodpanda), payment method, staff, category, **day of week** and **hour of day**. Toast lacks day of week and Square lacks weekday comparisons, and both are top forum requests.

---

## 10. Patterns to copy (ranked, concrete)

1. **Overview of KPI tiles that open their reports, each with a % change vs a chosen comparison.** Tiles: Net sales, Orders, AOV, Avg orders/day, Avg customers/day, Gross profit (or "Add costs" if coverage is low), Items sold, plus Top 5 items. Compare dropdown: *Previous period* (default), *Same period last year*, and *Same weekday avg (last 4 weeks)* (Toast weekly email). Tapping a tile opens its report with the same filters. *(Toast Weekly Overview, Shopify cards, Square widgets)*
2. **One "Items" report built as a Toast-style PMIX tree.** A level selector (Category / Item / Variation / Add-on group / Add-on) gives a flat ranking or a collapsible tree, with a **"% of parent / % of total" toggle** and sortable headers. Default columns: Qty, Net sales, % share. Optional columns: Gross, Discounts, Avg price, Cost, Gross profit, Margin. Add **attach rate** for add-ons (TouchBistro's "Modifier preference by menu item") and a setting for **item price including or excluding add-ons** (Toast). Totals reconcile to Net sales and the table shows it (a summary row at the top, as Shopify does).
3. **A persistent filter bar with pinnable filters and removable chips.** Date (Today, Yesterday, Last 7 days, This week, This month, Last month, This year, Custom), Compare, Branch (multi), Channel/Order type, Payment method, Staff, Category, **Day of week**, **Hour range**. Rarely used filters go in "More filters" and **can be pinned** (Toast). Active filters show as chips with clear-all (StoreHub). **Saved views** go under "Save as" (StoreHub saved filters, Shopify Save as). The filter state lives in the URL so links are shareable.
4. **A "Sales over time" chart with switchable metric tabs and granularity, plus a period table.** Metric tabs (Net sales / Orders / AOV / Gross profit / Customers) and granularity Hour · Day · Week · Month, with a **one-row-per-period table** beneath (Loyverse Sales summary). This directly answers "sales per month". Add an optional overlay of the comparison period (Square Sales trends).
5. **Profit shown only where honest, with visible cost coverage.** GP and margin columns sit beside net sales on Overview, Items and Categories (Loyverse), but only for costed lines (Toast). Show a coverage meter and a CTA that lists uncosted dishes (fixing Shopify's silent exclusion). Value at the *frozen* cost (Loyverse reviewers complain COGS shifted when unit costs changed).
6. **Definitions on every metric.** A "?" next to each KPI and column header shows the plain-language formula (StoreHub tooltip, Square help mode), e.g. "Net sales = what customers paid for food after discounts, excluding delivery fee and service charge". Write it in English, with Taglish where we already localise. When two screens differ on purpose, say why in the tooltip (Toast documents PMIX vs Summary differences; we should design them never to differ).
7. **Export that matches the screen.** CSV and XLSX of exactly the visible columns and filters (Toast), with a UTF-8 BOM so ₱ and ñ survive Excel (Loyverse complaint). A **print/PDF "Accountant view"** of the monthly sales summary in statement layout (Square's balance-sheet layout; Shopify got backlash for dropping printable finance reports). Large exports are emailed (StoreHub).
8. **Scheduled digests.** A daily "Kahapon" (yesterday) summary and a weekly summary by email, with an optional push in the merchant app. Contents: net sales, orders, AOV, customers, top items, vs SDLW / SWLY / 4-week average, plus next week's forecast (Toast weekly email). Later, schedule any saved view daily, weekly or monthly (Square). Let the owner add recipients (Square's owner-only rule is a known pain). Send a "no sales" day too, so silence never means broken.
9. **Cadence guidance on the reports home.** "What to check: Daily · Weekly · Monthly", linking to the right saved views (Toast best-practice articles turned into product). This suits first-time owners.
10. **Busy-times heatmap: Day of week × Hour.** Avg orders and sales per cell, filterable by branch and channel. This fills a gap both Toast and Square leave (StoreHub has group-by hour or day of week, Lightspeed added both to its Sales Summary).
11. **Channel / order-type breakdown as a first-class report.** Like StoreHub's transaction channels and Toast's dining options. For us: dine-in, pickup, delivery, POS, QR, Grab, foodpanda, with AOV per channel.
12. **Customer-quality menu lens.** Lightspeed's Magic Menu Quadrant uses popularity × repeat-customer retention. We already have per-order regular vs first-timer data and could tag dishes "brings people back". Pair it with our existing popularity × margin view.
13. **Ask-a-question entry point (Owl).** Square AI / Shopify Sidekick style: a question opens a pre-filtered saved view or report rather than a chat-only answer. Square lets users *pin* the result, and we could do the same.
14. **Branch comparison mode.** Toast's Compare Locations (two colours), plus a location overview table (net sales, orders, AOV, GP per branch). Mosaic and UTAK sell central multi-branch dashboards, so PH chains expect this.
15. **A BIR / Z-reading area kept separate from analytics** (StoreHub). Compliance reports don't clutter the insight IA.

## 11. Anti-patterns (avoid)

1. **Totals that disagree between reports.** Toast PMIX vs Summary, Square builder vs legacy, StoreHub variants vs products, Shopify conflicting counts. This is the top trust-killer in reviews. Every view must derive from `sales-model.ts`, and the summary row should show that it reconciles.
2. **Silently dropping rows.** Shopify's profit report omits uncosted products, and Toast hides zero-sale rows by default, leaving owners thinking items are missing. Show "N items hidden" with a toggle.
3. **Renames splitting history.** In Square, a renamed item becomes a new row. Key reports on ids and show the current name, with the old name in a tooltip.
4. **Sizes flattened into modifiers, and no hierarchy for nested modifiers** (Toast, Square). Keep the variation → option tree.
5. **Report sprawl and fragmentation.** Toast has 40+ reports in 9 categories. Shopify's 2025 rebuild split one report into several and caused a revolt. Fewer reports, each with filters and levels, beats many single-purpose ones.
6. **Replacing plain accountant reports with flexible-but-chart-only views** (Shopify Finance Summary backlash). Keep a printable statement view.
7. **Paywalling history or export** for core needs (Loyverse's 31-day free limit and $5/month export draw reviewer anger). If tiering, gate advanced views, not "download my own sales".
8. **Gross vs net defaults that differ by screen** (Square Home = gross, Reports = net) and region-dependent definitions. Pick Net sales everywhere and label it.
9. **Date filters that can't be saved with a custom view** (Square legacy custom reports), and long ranges that time out (StoreHub over 10 to 12 months). Saved views keep a *relative* date ("Last month"). Long ranges must be served by aggregated SQL with no timeouts (see our 2026-10-14 incident: one-day probes, bounded RPCs, ≤93-day guard → need a monthly-rollup path for "This year").
10. **Mobile/app reports that are a crippled subset** (Square app: 90 days, plus "View in Dashboard"). The merchant app should reach the same views, even if simplified.
11. **Export without per-day rows, or charts that can't be exported** (Square Sales trends complaints). Every chart needs a table behind it, and the table must be exportable.
12. **Unexplained numbers that need a human trainer** (UTAK hires report trainers). If a metric needs training, the UI has failed. Add inline definitions and plain-language "what changed" sentences.
13. **No day-of-week analysis**, forcing an export and a pivot (Toast, Square). This is cheap to build and highly requested.
14. **Insights or AI without a path to the underlying table.** AI answers must link to a filtered report that a human can verify.

---

## Sources

Toast
- PMIX overview: https://support.toasttab.com/en/article/Product-Mix-PMIX-Report-Overview
- Getting started with analytics & reports: https://support.toasttab.com/en/article/Getting-Started-with-Analytics-and-Reports
- Reporting dashboard (Weekly Overview): https://support.toasttab.com/article/How-to-Use-the-Toast-Reporting-Dashboard
- Sales Summary report / FAQ: https://support.toasttab.com/en/article/Sales-Summary-Report , https://support.toasttab.com/en/article/Sales-Summary-FAQ
- Menu reports overview: https://intercom.help/toast-central/en/articles/9307912-menu-reports-overview
- Reporting best practices (weekly/monthly): https://intercom.help/toast-central/en/articles/9302629-reporting-best-practices-weekly-monthly-quarterly-yearly
- Weekly Performance Summary email FAQ: https://support.toasttab.com/en/article/Weekly-Performance-Summary-Email-FAQs
- Email lists / nightly emails: https://support.toasttab.com/en/article/Contact-Settings-Email-List-Configuration-Nightly-Emails-1492812482238
- PMIX email not available: https://intercom.help/toast-central/en/articles/14288334-automatically-send-the-product-mix-report-by-email
- Custom reporting not possible: https://support.toasttab.com/en/article/Can-I-create-custom-reporting
- Benchmarking: https://support.toasttab.com/en/article/Toast-Benchmarking-Overview
- Reviews: https://www.capterra.com/p/136301/Toast-POS/reviews/ ; r/ToastPOS thread via https://axebps-redlib.hf.space/r/ToastPOS/comments/1jlee6l/what_are_your_most_common_problems_with_toast

Square
- Item / category / modifier reports: https://squareup.com/help/us/en/article/8363-view-item-category-and-modifiers-sales-reports
- Custom reports (blocks): https://squareup.com/help/us/en/article/6104-creating-custom-reports-in-the-online-dashboard
- Custom Report Builder: https://squareup.com/help/ca/en/article/8624-create-custom-reports-with-custom-report-builder , https://squareup.com/help/us/en/article/8624-create-custom-reports-with-custom-report-builder
- Summary & fee reports: https://squareup.com/help/us/en/article/5381-summary-and-fee-reports
- Glossary: https://squareup.com/help/us/en/article/5200-square-glossary
- Restaurant reporting: https://squareup.com/help/us/en/article/6433
- Discounts/comps/voids: https://squareup.com/help/us/en/article/8359-view-discounts-comp-and-void-reports
- Dashboard app: https://squareup.com/help/us/en/article/5618-get-started-with-the-square-dashboard-app
- Square AI release (Oct 2025): https://www.businesswire.com/news/home/20251008312312/en/
- Weekday vs weekend thread: https://community.squareup.com/t5/Questions-How-To/Weekend-vs-Weekday-Sales/m-p/85262
- Daily sales summary email threads: https://community.squareup.com/t5/Reports-Setup-Management/Sales-email-reports/m-p/833220
- COGS margin thread: https://community.squareup.com/t5/Payments-Troubleshooting/Cost-of-Goods-Sold-Report-Incorrect-Margin/td-p/686626
- Reviews: https://www.softwareadvice.com/retail/square-for-restaurants-profile , https://fitsmallbusiness.com/square-for-restaurants/

Loyverse
- Reports index: https://help.loyverse.com/help/reports
- Sales summary: https://help.loyverse.com/help/sales-summary-report-back-office
- Sales by item: https://help.loyverse.com/help/sales-item-report-back-office
- Sales by category: https://help.loyverse.com/help/sales-report-categors
- Receipts: https://help.loyverse.com/help/receipts-section-reports-back
- Dashboard app: https://help.loyverse.com/help/using-dashboard
- Export: https://help.loyverse.com/help/exporting-data-from-loyverse-account
- Reviews: https://www.capterra.com/p/150632/Loyverse-POS/reviews , https://www.getapp.com/retail-consumer-services-software/a/loyverse-pos/reviews/ , https://au.trustpilot.com/review/loyverse.com

Lightspeed
- K-Series reports: https://k-series-support.lightspeedhq.com/hc/articles/4403163919387 , https://k-series-support.lightspeedhq.com/hc/articles/1260804657209
- Magic Menu Quadrant: https://k-series-support.lightspeedhq.com/hc/en-us/articles/7339064083739-Magic-Menu-Quadrant
- Advanced Insights launch: https://www.lightspeedhq.com/news/lightspeed-restaurant-launches-advanced-insights/
- X-Series custom reports: https://x-series-support.lightspeedhq.com/hc/articles/25534172721819
- Lightspeed Analytics navigation: https://retail-support.lightspeedhq.com/hc/en-us/articles/4410659754139-Navigating-Lightspeed-Analytics-reports

Shopify
- New analytics default: https://changelog.shopify.com/posts/new-analytics-is-now-the-default
- Dashboard sections: https://changelog.shopify.com/posts/organize-your-analytics-dashboard-with-custom-sections
- Overview dashboard: https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard
- New reports navigation: https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics/new-reports
- Explorations: https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/new-analytics/explorations
- Profit reports: https://help.shopify.com/manual/reports-and-analytics/shopify-reports/report-types/profit-reports
- Natural-language queries: https://changelog.shopify.com/posts/turn-business-questions-into-analytics-reports-with-natural-language-queries
- AOV definition change: https://changelog.shopify.com/posts/your-average-order-value-now-has-a-new-definition-in-shopify
- Community backlash: https://community.shopify.com/t/shopify-needs-to-revert-back-to-old-analytics/418200 , https://community.shopify.com/t/shopify-has-changed-their-finance-summary-report-no-longer-a-report/414614

Others
- Clover reporting: https://www.clover.com/pos-systems/business-tracking-reporting ; Clover Insights review: https://www.cardfellow.com/blog/clover-insights
- TouchBistro menu reports: https://cdn.touchbistro.com/help/articles/menu-reports ; feature list PDF: https://images.g2crowd.com/uploads/attachment/file/52555/expirable-direct-uploads_2Fe0959b88-28b5-40f3-b219-659100a83d68_2FTouchBistro-feature-list.pdf
- Revel PMIX & Sales Summary: https://blog.revelsystems.com/blog/2018/02/13/product-mix-sales-summary-report
- StoreHub: https://care.storehub.com/en/articles/15457801-how-to-find-and-understand-your-storehub-sales-reports , https://care.storehub.com/en/articles/8600136-how-to-understand-and-customize-your-storehub-reports , https://care.storehub.com/en/articles/5726837-how-to-view-sales-by-product-report , https://www.storehub.com/ph/blog/storehub-reports
- StoreHub vs UTAK: https://www.storehub.com/ph/blog/storehub-vs-utak ; UTAK: https://home.utak.io , https://www.paymongo.com/company/partners/utak-pos
- Mosaic: https://www.mosaic-solutions.com/pos-analytics-philippines/ , https://support.mosaic-solutions.com/knowledge/how-to-navigate-mosaic-pos-back-office
