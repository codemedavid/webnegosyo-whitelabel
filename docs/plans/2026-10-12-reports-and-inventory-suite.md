# Reports & Inventory Suite — Product Plan

**Status:** APPROVED 2026-10-12 — owner replied "go" (all nine §11 defaults accepted). Building in worktree `.claude/worktrees/reports-inventory` on `feat/reports-inventory`.
**Date:** 2026-10-12
**Surfaces:** web admin first (`/[tenant]/admin`), merchant app (`webnegosyo-app`) after.
**Backend rule:** platform Supabase first. Every number is verified on the real platform DB before a phase is called done.

This plan merges the work of seven specialists:
- market research
- systems architecture
- UX/UI
- roles & permissions
- metrics & standards
- security
- QA

Their findings are cited inline as **[MKT] [ARCH] [UX] [ROLES] [METRICS] [SEC] [QA]**.

---

## 0. The one-paragraph pitch

A merchant opens **Reports** and reads one honest sentence: *"₱84,320 this week, up 12% on last week. Saturday brought in a third of it."* Every number below it agrees with every other screen, with the export, and with the cash drawer.

**Stock** tells them what runs out before Friday and builds the palengke list. A delivery is recorded by snapping the resibo and typing what they paid. Waste takes two taps. A count shows exactly how many pesos went missing and where. **Profit** shows what the food actually cost, at the price paid that day, not today's price.

Nothing on these screens can be quietly edited after the fact by a staff account.

---

## 1. What we found (the honest baseline)

### 1.1 Already built: reuse it, don't rebuild it [ARCH]

**Inventory core** (`src/lib/inventory/*`, about 85 modules):
- ingredients, units and conversion
- recipes on items, variations, add-ons, modifiers and prep items
- order-driven deduction on all three backends, with a duplicate-claim guard
- a stock ledger with running totals
- per-branch stock (no row means ZERO), transfers, count sessions
- the audit log and the reconciliation banner
- the daily inventory report: opening + received − sold − waste ± transfers ± count = closing, with a variance verdict
- low-stock alerts, which fire on the crossing, plus auto-86

**Merchant notifications:**
- low-stock push to the app bell
- the migration is applied live, but the code is still uncommitted on `feat/bill-split-tender`

**Sales:**
- The dashboard has a backend-neutral `SaleRecord` with Supabase and Convex readers and paging (`src/lib/dashboard/`).
- Split-tender payment slices exist in Convex and in the app, also uncommitted.

**Export:**
- The web has an ingredient CSV/XLSX export (`src/lib/inventory/import/`, exceljs).
- The app has a pure export core, capped at 2000 orders, and still needs an EAS build to ship.

**SC/PWD:**
- `gov_discount_claims` and `gov_discount_approvals` exist live, from a parallel workstream (see `sc-pwd-gov-discounts-plan`).
- This suite **reads** them for reports. It does not build SC/PWD itself.

### 1.2 Missing [ARCH][MKT]

| Brief item | Status |
|---|---|
| Daily/weekly/monthly sales | PARTIAL: dashboard has today/7/30/90 only. No week/month grain, no discount/fee split |
| Category report | MISSING on every surface |
| Item report | PARTIAL: Product Analytics is **Convex-only** and wrongly routed on credentials |
| Payment-type report | MISSING on web |
| Sales summary + transaction history | PARTIAL: Orders list has no totals, search, payment filter or export |
| Purchases & receiving | MISSING: a "delivery" is one bare ledger row. No supplier, header or invoice. Cost is captured on only **23 of 524** receives |
| Waste/spoilage reasons | MISSING: everything is `waste` plus free text |
| Period variance | PARTIAL: single day only |
| COGS / gross profit | PARTIAL: daily only, priced at **today's** cost, prep items at ₱0, nothing per item or category |
| Excel/CSV export (sales) | MISSING on web |
| Web low-stock bell | MISSING (in-page banner only) |

### 1.3 Problems we must fix first, because the numbers can't be trusted yet

**Security: live today, independent of this feature [SEC]**

| Sev | Finding | Effect |
|---|---|---|
| HIGH-1 | Any staff token, even POS-only, can directly UPDATE `inventory_items.current_qty/unit_cost` and `inventory_stock.current_qty` | Stock and cost can be rewritten with no ledger row and no audit row |
| HIGH-2 | Any staff token can INSERT `stock_movements` with any `created_at`, any `created_by`, `reason='sale'`, or a waste row that adds stock | Backdated or forged ledger. Last month's COGS and variance can be rewritten under someone else's name |
| HIGH-3 | The DB enforces only tenant + branch, never permission keys | Staff without `analytics` (34 accounts) can read all orders, payments, customer phones and costs through the API |
| MED-4 | Any admin can rewrite recipes store-wide and DELETE `order_stock_applications` | Re-deducts, or never deducts, an order |
| MED-5 | `resolveActingBranchScope` fails **open** (`{kind:'all'}`) on error | Dangerous if reused for reads |
| MED-6 | `/api/inventory/ceilings` has no auth, uses the service role, and accepts any tenant | Leaks per-dish "can make" counts. Lets anyone hammer the shared DB |
| MED-7 | `delete_inventory_item` checks store membership only | Any staff can wipe an ingredient from every recipe |
| LOW | The receiving branch can edit a transfer's paperwork. Grants are too broad (TRUNCATE, audit-log UPDATE/DELETE). Two CSV formula guards have drifted apart. `stock_movements` has no `(tenant_id, created_at)` index | — |

**Leak found in UI [ROLES]:** `/admin/inventory` shows daily revenue, COGS and food-cost % to anyone with `menu`. That is 18 accounts that have `menu` but not `analytics`.

**Number correctness (live data) [METRICS][ARCH]**

1. **POS discounts don't land in `discount_total`.** All 114 discounted POS orders in 60 days show 0. Any SQL that sums the column under-reports discounts.
2. **Order discounts are never allocated to lines.** `order_items.discount_amount` is always 0, so item totals don't add up to sales.
3. **"Revenue" is really Σ `orders.total`.** That includes delivery, service charge, unpaid orders and stale pending orders. Food cost % divides by it, which flatters it.
4. **About eight separate revenue readers disagree** on population, date and status.
5. **Payment-type totals count the unpaid remainder under the checkout method.** "GCash ₱X" includes money never received.
6. **3,406 delivered web orders (₱1.14M) were never marked paid.** 33 orders have `amount_paid > total`, so a refund is due and nothing flags it.
7. **COGS uses today's `unit_cost`.** Sale, waste and void rows carry no cost, so history moves after every delivery.
8. **The average-cost blend is computed in JS after the insert** (`stock-service.ts:417`). Two concurrent receives race each other.
9. **Silent truncation at the 1000-row cap:**
   - `daily-report-read.ts` and `sumOrderTotals` don't page.
   - Convex `getAllOrderItemsInternal` takes no time window.
   - App exports stop at 2000 rows.
10. **Convex period bounds use `lte`.** An order at exactly 00:00:00.000 is counted on two days.
11. **Growth shows 0% instead of "new"** when the base is 0.
12. **Payment names are free text:** 76 variants, and "none" makes up 25% of recent orders. POS rarely sets `payment_method_id`.
13. **Mixed-backend tenants exist.** `papajays-grillhouse` resolves to Convex but has 972 POS orders in the platform `orders` table, and there are others like it.

**Test infrastructure [QA]**
- No CI runs Jest.
- The PGlite SQL runners can't run (dependency not installed).
- `fakeSupabaseTables` has no row cap and no range support.
- `assistant-live.test.ts` maps the session client to the service role. Never copy that pattern for role tests.

### 1.4 Who actually uses this (real data, 30 days) [ROLES]

- 15,344 orders across 53 platform tenants. 10 tenants do more than 300 a month, 3 do more than 1,000. The largest, gungjeon, does **6.5k orders a month across 5 outlets**.
- Inventory is used by few stores and run by owners:
  - 58 tenants have it switched on, 13 have recipes, 11 actually deplete.
  - Owners make most manual stock moves; staff do so in only 3 tenants.
  - 21 counts are left open. Waste has been logged by only 6 tenants.
- Cashiers record **73% of payments**, so cashier and shift reports matter.
- Branch reporting serves only one tenant today (`outlet_id` stamped on orders). Build it correctly, but don't optimise for it yet.
- Backends: 192 tenants resolve to platform, 96 to Convex, 0 to per-tenant Supabase.

---

## 2. Product decisions (what we add, what we cut)

### 2.1 Add (beyond the brief) [MKT]

1. **Suppliers (lightweight, optional) and delivery records.** "Palengke" is a valid supplier. Without these there is no true COGS, no price history and no reorder.
2. **Snap-a-resibo.** A receipt photo, printed or handwritten, is read by the existing vision parser. It **pre-fills** the lines; nothing saves until the merchant taps Save.
3. **Price-change alerts with recipe impact**, e.g. *"Sibuyas up 38% since last buy — your Sisig costs ₱6 more."*
4. **Buy list ("Pamalengke list")**: low or out items × (par − on hand), grouped by supplier. Copy, Messenger share or print.
5. **"Where your pesos leaked" card**: the top 5 ingredients by peso variance between the last two counts.
6. **Voids / refunds / discounts report**, broken down by cashier and reason.
7. **Cashier/shift report and an End-of-day summary.** We never call it a "Z-reading" (see 2.3).
8. **Hour × day-of-week heatmap.** Reuses `order-heatmap.tsx`.
9. **Add-on / modifier sales with attach rate**, e.g. sinkers, extra rice.
10. **Profit by channel after commission** (Grab/foodpanda kinds already exist).
11. **Daily close summary push** to the owner at business-day close.
12. **Month-end pack**: one Excel workbook for the bookkeeper.
13. **External accountant seat**: invite-only, read-only, time-boxed, no PII.

### 2.2 Cut or defer [MKT][UX]

| Item | Why |
|---|---|
| FIFO / lot / expiry costing | Weighted-average cost is PFRS-allowed and already built; FIFO needs layer data SMBs don't produce |
| General ledger, journals, accounts payable, 3-way match | Ship clean exports for the bookkeeper instead |
| Purchase-order approval workflows, supplier portal, emailing POs | A shareable buy list is enough |
| Custom report builder | Good defaults, filters and export beat it |
| ML demand forecasting | Not needed. Usage × lead time is enough |
| Prime cost % | We have no labour cost data |
| A standalone Waste page or Exports page | Waste is a sheet you can open from anywhere. Export is a sheet on every report |
| The separate Product Analytics page | Folded into Reports → Items ("Menu matrix" view), so there's one item total, not two |
| Any BIR accreditation claim | A separate regulatory project |

### 2.3 Compliance wording [METRICS]

- WebNegosyo is **not** a BIR-accredited POS. We never use "Official Receipt", "Sales Invoice", "X/Z-Reading", "Accumulated Grand Total", "MIN" or "PTU".
- Report footer: *"For your own records and bookkeeping. WebNegosyo is not a BIR-accredited POS. Issue your BIR-registered invoices separately."*
- VAT block only when the store's `vat_registered` flag is on:
  - VATable sales = net ÷ 1.12
  - VAT = net − VATable
  - exempt sales shown separately
- Non-VAT stores see "gross receipts for percentage tax".
- **The CPA must check:** the percentage-tax threshold, alcohol, service-charge VAT, and the sales-book column layout.

---

## 3. Information architecture [UX]

### 3.1 Sidebar

```
Start here · Dashboard · Orders
Menu ▸ Menu · Categories · Add-ons · Boost Sales          (stock leaves Menu)
REPORTS                                   key: reports
  Sales          /admin/reports
  Transactions   /admin/reports/transactions
  Profit         /admin/reports/profit                       key: costs
STOCK                                     key: inventory (needs inventory_enabled)
  Stock          /admin/inventory
  Deliveries     /admin/inventory/deliveries
  Counts         /admin/inventory/counts
  Recipes        /admin/inventory/recipes                    key: menu
  Transfers      /admin/inventory/transfers                  (multi-branch only)
GROW ▸ Customers · Loyalty · Vouchers                        ("Analytics" group removed)
STORE ▸ … · Settings     HELP ▸ Learn
```

- History (`/admin/inventory/log`) leaves the sidebar. It's reached from Stock → History and from the item drawer.
- `/admin/product-analytics` gets a 301 redirect to `/admin/reports/items?view=matrix`.
- Waste is a sheet, not a page. Its history is `log?reason=waste`.

### 3.2 Each page's ONE job

| Route | Job |
|---|---|
| `/admin/reports` | "How did this period go, and why?" Insight sentence, 4 KPI tiles, trend, a "Break it down" list, and a reconciling totals ledger |
| `/admin/reports/[dim]`: `items`, `categories`, `payments`, `channels`, `hours`, `branches`, `discounts`, `staff` | One breakdown, ranked, with a comparison |
| `/admin/reports/transactions` | "Find that sale." Closed orders, search, filters, drawer, export. Orders stays the **live** queue |
| `/admin/reports/profit` (`?day=` = day close) | "Did I make money after ingredients, and where did stock leak?" Absorbs the Inventory Reports tab |
| `/admin/reports/end-of-day` | End-of-day summary: tenders, cash expected vs counted, voids, discounts, by cashier |
| `/admin/inventory` | "What do I buy or fix today?" Sorted by days of cover, buy list, quick actions |
| `/admin/inventory/deliveries` (`/new`, `/[id]`) | Record what came in and what you paid |
| `/admin/inventory/counts` (`/[id]`) | Count the shelf blind, see what's missing in ₱ |
| `/admin/inventory/recipes` | Make every dish deduct (coverage %) |

### 3.3 Shared filter bar (`ReportFilterBar`)

- Date presets: Today · Yesterday · This week · Last week · This month · Last month · Custom.
- Weeks start Monday (ISO 8601).
- Compare defaults:
  - for a day: same weekday last week, cut at the same clock time
  - otherwise: the previous period
  - same period last year only when that data exists
- Branch chip only for store-wide accounts with 2+ branches. Branch accounts see a locked chip. Consolidated views carry an **Unassigned** row.
- Channel and Order-type chips list only the values present in the period.
- All filter state lives in the URL, so views can be shared. "Save view" pins one per user.
- On a phone this collapses to `[This week ▾] [Filters · 2]` and a sheet.

---

## 4. Design direction [UX]

**Visual language**
- The Dashboard and Boost vocabulary: white cards, `ring-1 ring-border`, `rounded-2xl`, the `wn-*` palette, onboarding's contrast-safe neutrals.
- Stripe-like restraint: hierarchy comes from type and whitespace. Colour only carries meaning.

**Numbers**
- `tabular-nums lining-nums`, right-aligned, U+2212 for minus.
- No centavos on summaries. Centavos in transactions, unit costs and COGS.
- `₱1.2M` only on chart axes.
- KPI value 28–32px / weight 800. Label 13px / 600, muted.

**Colour semantics**
- `DeltaPill` has a polarity: higher-is-better / lower-is-better / neutral.
- Colour follows good or bad, never direction alone. An arrow and a sign are always shown.
- Purchases are neutral grey. Food cost above its band is amber.
- Red is reserved for out of stock, money lost, and errors.
- Small bases show "+3", not "+300%".

**Charts** (Recharts, with a table toggle and a screen-reader sentence on every one):

| View | Chart |
|---|---|
| Trend | Columns with a dashed comparison line |
| Today | Cumulative pace line vs last week |
| Items and categories | Ranked bar inside the table |
| Payments | One 100% stacked bar |
| Hours | Heatmap |
| Profit | Waterfall plus a food-cost line over a target band |
| Variance | Diverging bar |

No pies, donuts, dual axes or 3D.

**States**
- Skeletons that match the final layout.
- Old figures stay visible at 60% opacity during a refetch.
- Errors are scoped to one card.
- An unknown value shows **"—"**, never ₱0 or 0% (`UNKNOWN_FIGURE`).
- `CoverageNote` sits above the figures, e.g. *"Profit counts 41 of 58 dishes — 17 have no recipe yet."*

**Words**
- "Missing", not "shrinkage".
- "Ingredient cost (COGS)".
- "Counted vs expected", not "variance".
- Every metric has an ⓘ `MetricInfo` with its definition and formula.

**Interaction**
- Insight first: deterministic sentences from a pure copy module, not an LLM. "Ask Owl why" hands the filtered context to the assistant.
- Undo instead of confirm on routine entries.
- Two taps to record waste.
- Keyboard grids for deliveries and counts (Enter, ⌘↵, `/`, and a global `W` for waste).
- Every number links to the next action: low stock → buy list → delivery.

**Accessibility (WCAG 2.2 AA)**
- Contrast 4.5:1 for text, 3:1 for chart marks.
- Colour is never the only signal.
- `scroll-padding-top` under the sticky bars (2.4.11).
- 44px touch targets (2.5.8).
- No drag-only range selection (2.5.7).
- Sheets trap and restore focus.

**Motion**
- No count-up animations.
- 150ms crossfade, 200ms sheet transitions.
- `prefers-reduced-motion` respected.

**Layout**
- Mobile-first. Below 640px tables become cards. From 1024px drawers open beside the list.

**New primitives**

`src/components/admin/reports/`:
- `KpiTile`, `DeltaPill`, `InsightCard`, `MetricInfo`, `CoverageNote`
- `DateRangePicker` (adds shadcn `popover` and `calendar`)
- `ReportFilterBar`
- `DataTable`: sticky header, first column and totals row; column presets Basic / Profit / Everything; card mode on mobile
- `BarCell`, `ExportSheet`

`src/components/admin/stock/`:
- `QuickEntrySheet`, `ItemPicker` (recents first), `QtyStepper`, `TransactionDrawer`

Wireframes for every page are in the UX lead's spec, summarised in §3 and §9 phases.

---

## 5. Metric dictionary: one definition, every screen [METRICS]

**Shared rules**
- Money is integer centavos, rounded half-up per line.
- Allocation uses largest-remainder.
- Prices are VAT-inclusive.
- A **live order** has status not in `REVERSED_STATUSES`, from one shared list.

| Label / key | Formula | Notes | Dated by |
|---|---|---|---|
| Gross sales `gross_sales` | order total − service − (delivery − delivery discount) + food discount, live orders (0c: derived from the total, the authority; lines that disagree are scaled and disclosed) | Excludes fees, service charge, tips | Order placed (offline POS: sale time) |
| Discounts `discounts` | Σ granted food discounts, split voucher / manual / senior / pwd / senior_pwd / promo (a delivery discount lowers the delivery fee) | `discount_data` (= `readOrderDiscount`). Since 0c `discount_total` is trigger-derived from it and safe to sum | Order date |
| Refunds `refunds` | Σ `order_payments.kind='refund'` = money handed back | 0c: every ledger refund is change returned after an edit LOWERED the total, so it is NOT taken off sales again; it lowers collected. Sales returned after the fact come from store-activity's refunds ledger (P6). A cancel is a void | Order date on summaries; refund date on collected/drawer views (each labelled) |
| **Net sales** `net_sales` | gross − discounts | The headline "Sales". **No fees** | Order date |
| Service charge | Σ `service_charge_amount` | Staff liability (RA 11360). Never in sales | Order date |
| Delivery fees | Σ (`delivery_fee` − delivery discount) | Own line | Order date |
| Total billed | net + service + delivery = Σ live `orders.total` | What the code calls "revenue" today | Order date |
| Total collected | Σ charges − Σ refunds actually received | Paid rule: ledger, OR `payment_status ∈ {paid,verified}`, OR handover (delivered, no table) | Payment date |
| Unpaid `unpaid_balance` | billed − collected (per order, ≥ 0); over-collection is its own "Overpaid" figure | Always shown, never hidden. NULL payment_status = nothing to say (app rule) | As of report end |
| Orders | count of live orders | Cancels go on a Voids card (count, ₱, %) | Order date |
| Avg order `aov` | net ÷ orders | `null` when there are no orders | — |
| Item / category net | line gross − allocated order discount (pro-rata, largest-remainder) | Σ items = Σ categories = net sales, exactly | Order date |
| By payment type | Σ ledger nets per **normalised** method | Unpaid remainder shown as "Unpaid", not under a method | Payment date |
| COGS (recipe) | Σ (sale − void) qty × **cost frozen on the movement** | Unpriced ingredients are disclosed | Movement date |
| COGS (counted) | opening + purchases − closing, all at counts | Only between two full counts, else `null` with a reason | Period |
| Gross profit / margin % | net − COGS; ÷ net | Label which COGS. `null` if net ≤ 0 | Period |
| Food cost % | COGS ÷ **net sales** | Not ÷ total. Target band default 28–35%, editable | — |
| Waste value / waste % | Σ waste × frozen cost; ÷ COGS | By reason code | Movement date |
| Counted vs expected | actual usage − recipe usage; ₱ = qty × cost; % of recipe COGS | ≤2% good, ≤5% watch, >5% investigate. Rank by ₱ | Count date |
| Missing (shrinkage) | short side only, per branch, × cost | Count gains reported separately, never netted | Count date |
| Stock value | Σ on hand × weighted-average cost | Negative stock flagged and excluded | As of |
| Days of cover | on hand ÷ avg daily usage (28-day trailing) | `null` with no usage | As of |
| Purchases | Σ delivery line totals | Uncosted deliveries counted separately | Received date |

**Time**
- Tenant timezone (all `Asia/Manila`), half-open `[start, end)`.
- Optional per-tenant **day-ends-at** hour (default 00:00). If enabled, `daily_number` must reset on the same boundary.
- Growth is `null` ("new") when the base is 0.
- Partial periods are labelled "so far".

**Costing**
- **Perpetual weighted-average cost**, recomputed **atomically in the ledger trigger**.
- Every movement stores the unit cost at insert. Voids reuse the cost of the sale they reverse.
- Prep items are costed from recipe ÷ yield at depletion.
- Dish-level cost snapshot goes on `order_items`.

**Category history**
- Add a `category_name` snapshot on `order_items` from now on.
- Older rows are labelled "by current menu".

**Order edits after a day closes**
- Show a "restated" marker on any day changed after it closed.
- Freezing closed days with adjustment postings is deferred.

---

## 6. Roles & permissions [ROLES][SEC]

### 6.1 Three new keys: 15 → 18

| Key | Covers | Rollout (nobody silently loses access) |
|---|---|---|
| `reports` | Sales, transactions, payment, cashier, end-of-day; their exports | `IMPLIED_BY: analytics` |
| `inventory` | Stock, deliveries, suppliers, waste, adjustments, counts, transfers, par, alerts | One-time backfill to every scoped account holding `menu` (27) |
| `costs` | Unit cost, COGS, gross profit, food cost %, ₱ variance, editing costs | One-time backfill to `menu` holders, who see costs today |

- **Rejected:** separate `purchasing` (folded into `inventory`) and `export` keys. Export follows the view key. Cost columns need `costs`; PII columns need `customers`.
- `menu` keeps recipes and the ingredient master. `orders` stays the live queue and **does not** grant `reports`.
- `NULL` permissions still means full access. That's 44 non-owner accounts, so owners get a one-time "Review staff access" prompt.

**Registry sync is four copies:**
- `src/lib/staff-permissions.ts`
- `webnegosyo-app/lib/staff-permissions.ts`
- desktop
- `supabase/functions/manage-staff/staff-core.ts` (redeploy needed)

**Route maps:** every new route goes in `ADMIN_SECTION_PERMISSIONS` and `MOBILE_TAB_PERMISSIONS`. An unmapped route is open by default, so a guardrail test fails on any unmapped reports or inventory route.

### 6.2 Capability matrix

A = allow · B = own branch · S = own shift · D = deny · \* = opt-in

| Capability | Owner | Branch mgr | Cashier | Kitchen | Inv. clerk | Accountant |
|---|---|---|---|---|---|---|
| Sales summary / breakdowns | A | B | S | D | qty only | A |
| Transaction history | A | B | S (lookup/reprint) | D | D | A (PII masked) |
| See cost / margin / COGS | A | B\* | D | D | D (0d: a delivery price is a cost change, so it needs `costs`; a clerk's delivery is recorded uncosted) | A |
| Export | A | B (no PII) | D | D | stock only | A (no PII) |
| Record delivery | A | B | D | B\* | B | D |
| Edit/void a delivery | A | B | D | D | own entries, same day | D |
| Record waste | A | B | D | B | B | D |
| Adjust stock | A | B | D | D | B (reason required) | D |
| Run a count | A | B | D | B (blind) | B (blind) | D |
| Approve a flagged count | A | B (not own) | D | D | D | D |
| Suppliers | A | read | D | D | A | read |
| Recipes | A | D | D | read, no cost | D | D |
| Low-stock thresholds / alerts | A | B | D | alerts B | B | D |

### 6.3 Sensitive data

- **Cost:** shown only with `costs`, enforced **in the database**, not just hidden in the UI. Without it, cost columns are *absent*, never ₱0.
- **Revenue on Inventory:** gated on `reports`, with a visible "Ask the owner for Reports" note.
- **PII:** names show. Phone, email and address are masked to the last 4 unless the caller has `customers`; this applies to exports too. The app's current Orders export, which leaks PII to anyone with `orders`, gets tightened.
- **Cashier performance:** owner sees all, manager sees their branch, cashier sees only their own shift.
- **Accountant seat:** `reports` + `costs`, no PII, `expires_at` (90 days, renewable), outside the 3-staff cap.
- **Support** "view as" is read-only and audited. Support never exports on a merchant's behalf.

---

## 7. Architecture [ARCH]

### 7.1 Pure engines: `src/lib/reports/`

These are portable to the app and parity-guarded.

| Module | Job |
|---|---|
| `sales-model.ts` | The §5 definitions. The **only** place "net sales" is defined |
| `money.ts` | Centavos and largest-remainder `allocateCents`. Moved from the app's `lib/bill/money.ts` and shared |
| `period.ts` | Day/ISO-week/month buckets and comparisons, on top of `inventory/business-day.ts` (no second Manila rule) |
| `payment-buckets.ts` | ONE copy of the split-tender slices. Normalised by method id → folded name → type, reusing `platform-analytics-merge.ts` normalisation |
| `discount-allocation.ts` | Order discounts → lines |
| `category-rollup.ts` | Uses the snapshot, falling back to the current menu; an "Uncategorised / deleted" bucket |
| `cogs.ts` | Cost priority: frozen movement cost → `costing.ts` recipe cost → `product_costs` → unknown (coverage %) |
| `ledger-period.ts` | Generalises `daily-report.ts` row arithmetic to N days. Does not rewrite it |
| `insights.ts` | The deterministic sentences |
| `export-rows.ts` | Screen rows → file rows, one function for both |

### 7.2 Read layer: `src/lib/reports/read/`

- `readSalesReport(tenant, window, scope)` switches on `resolveOrderBackend`:
  - platform → SQL RPCs
  - convex → extend `read-convex-sales.ts`
- It returns `{ data, coverage, notes, truncated }`.
- Scope comes from a new **fail-closed** `requireReportScope`: the account's branch scope, which throws on a missing or errored `app_users` row. The duplicate `stock-service.ts:189` copy is deleted.
- Mixed-backend tenants (e.g. papajays) are detected and shown a coverage warning.

### 7.3 SQL (platform)

The report RPCs are SECURITY INVOKER, STABLE, with `search_path=''`. Arguments: `(p_tenant, p_from, p_to, p_outlet, p_tz)`. The range is validated in the function: 93 days interactive, 366 for export.

- `report_sales_by_period(…, p_grain)`
- `report_sales_by_item(…)`
- `report_sales_by_category(…)`
- `report_payments(…)`, with the same rule as `payment-buckets.ts`, pinned by a shared fixture
- `report_stock_movements(…, p_reasons[])`

Rules:
- No materialized rollups yet. Order edits and the 7-day deletion purge would both need invalidation. Revisit at about 50k orders per tenant per month.
- Indexes:
  - `stock_movements (tenant_id, created_at desc)`
  - `(tenant_id, outlet_id, created_at desc)`
  - `purchase_receipts (tenant_id, outlet_id, received_at desc)`
- Cache: request-level `cache()`. Redis for **closed** periods only, 5–10 min. Today is never cached.

### 7.4 New and changed schema

**`suppliers`**
- Columns: id, tenant_id, name, contact_name, phone, notes, is_active, timestamps.

**`purchase_receipts`**
- Columns: id, tenant_id, outlet_id, supplier_id (nullable), reference_no, business_date, `received_at` (server), status `posted|voided`, total, paid_via (cash/gcash/bank/credit), photo_file_id, notes, created_by, client_request_id (unique), `reverses_id`.
- Append-only: a correction is a void plus a new receipt.

**`purchase_receipt_lines`**
- Columns: receipt_id, inventory_item_id, quantity, unit_id, line_total, unit_cost (derived), stock_movement_id.

**`stock_movements` changes**
- `+ purchase_receipt_id`
- `+ reason_code` (TS map: spoiled, expired, damaged, dropped, staff_meal, comp, theft, prep_error, other), with a CHECK that it is allowed only on waste/adjust/stocktake.
- `+ adjust` reason, which touches four places: `stock-ledger.ts`, the app's `movement-reason.ts`, the DB CHECK, and the daily-report buckets.
- The **unit cost is frozen at insert**, and the moving average moves into the trigger.

**`order_items` changes**
- `+ category_name` (BEFORE trigger, same-store category at sale; not editable afterwards)
- Dish cost at sale goes to **`order_item_costs`** (order_item_id, tenant_id, unit_cost, source `recipe|manual`, costed_at), not a column here: every staff account that can see an order can read its lines. *(Changed during 0b, 2026-10-12.)*

**`tenants` changes**
- `+ vat_registered`
- `+ day_ends_at` (time, default 00:00)
- `+ food_cost_target_low/high`

**`export_audit`**
- Columns: who, kind, range, branch, columns, rows, ip_hash, created_at.

**`app_users` changes**
- `+ expires_at`, for the accountant seat.

### 7.5 Exports

- Route: `GET /api/reports/export?kind=…&format=csv|xlsx&from&to&outlet`.
- It calls **the same report functions as the screen**, so the file can't disagree with the screen.

**CSV**
- One shared writer, moved to `src/lib/export/csv.ts`.
- UTF-8 BOM, CRLF, RFC 4180.
- Formula guard covers `= + - @ \t \r \n` and the full-width variants.
- Raw decimals, ISO dates, `+08:00` timestamps.

**XLSX**
- exceljs, server-side.
- Typed cells, `#,##0.00`, frozen bold header, autofilter.
- One sheet per row-grain, plus a "Read me" sheet: definitions, filters, timezone, generated-at time, and a truncation warning.
- Totals go in a summary sheet, never inside the data rows.

**Limits and naming**
- File name: `{slug}_{report}_{from}_{to}_{branch|all}.xlsx`.
- Rate limit: 10 per 10 min and 50 per day per person, via `checkRateLimit` with `onRedisFailure:'instance'`.
- 50k rows per file, stated in the file.
- One `export_audit` row per export. The owner gets a digest of exports made by others.
- PII requires `customers` and a password re-check.

**Month-end pack**
- One workbook: Sales by day, Items, Categories, Payments, Transactions, Transaction lines, Deliveries, Waste, Profit.

### 7.6 Receipt photos

- Reuses the payment-proof pipeline: magic-byte sniff, JPEG/PNG/WebP only, 5MB cap, rate limit.
- Behind auth and `inventory`.
- Stored as an ImageKit **private** file. Served only through signed URLs with a TTL of 10 min or less, minted after a scope check.
- The DB stores the file id, never a URL.

---

## 8. Security requirements (engineers must satisfy all) [SEC]

1. **Policy template for every new table:**
   - `app_user_has_permission(tenant_id,'<key>') AND app_user_may_reach_branch(tenant_id, outlet_id)`.
   - Roles `{authenticated}`.
   - Separate SELECT, INSERT, UPDATE and DELETE policies. No `FOR ALL`.
   - Ledger-like tables get no UPDATE or DELETE.
   - Never `outlet_id IS NULL OR …`.
   - Always compare against the row's own `tenant_id`.
2. **Ledger lockdown (Phase 0):**
   - A BEFORE INSERT trigger stamps `created_at=now()` and `created_by=auth.uid()`.
   - A CHECK ties each reason to its sign.
   - `authenticated` may insert only receive, waste, stocktake and adjust. Sale, void and transfer go through the service role or a definer function.
   - `current_qty` and `unit_cost` can only be changed by the ledger trigger.
   - `order_stock_applications` becomes service-role only.
3. **Definer function template:**
   - `SET search_path=''`, fully qualified names.
   - First statement: an `auth.uid()` permission and branch check, raising `42501` on failure.
   - `REVOKE ALL FROM public, anon`.
   - Reports prefer INVOKER.
4. **Never pair the service role with a client-supplied tenant or outlet.**
5. **Zod on every action and route:**
   - ISO dates and range caps.
   - UUID-or-null outlet.
   - Bounded money and quantities.
   - Notes ≤ 500, names ≤ 120, control characters stripped.
6. **Corrections are reversing entries.** Retries carry a `client_request_id`.
   - `business_date` is separate from server `created_at`.
   - A **period lock**: nothing dated before the last closed count, or more than 7 days back, without the owner.
   - Every write lands in `inventory_audit_log`.
7. **Old gaps closed:**
   - permission conjunct on orders, order_items and order_payments SELECT (after checking POS, KDS and table flows)
   - `delete_inventory_item` requires `menu` and refuses branch-locked accounts
   - transfer receiver may update only status/received
   - the ceilings route gets auth, a rate limit and a cache
   - TRUNCATE, REFERENCES and audit-log UPDATE/DELETE revoked from anon and authenticated
8. **The `costs` key is enforced in the database.** Recommended: move cost into an `inventory_item_costs` table readable only with `costs`. Column grants are not enough, because `select *` breaks under them.
9. Migrations are **applied and probed by object name**. Types are regenerated through the Supabase MCP.

---

## 9. Phased build

Each phase ships on its own and is verified on platform before the next one starts.

### Phase 0: Trust foundations. *Mostly invisible, nothing else is safe without it.*

| Track | Work | Size |
|---|---|---|
| 0a Security | HIGH-1/2, MED-4/6/7 and the LOW fixes from §8.2/§8.7. HIGH-3 (permission conjunct on order reads) after checking the POS, KDS and table flows | M |
| 0b Frozen cost | Cost on every movement, atomic weighted-average cost in the trigger, prep cost at depletion (computed in the DB, mirror of `costing.ts`), `order_items.category_name` + `order_item_costs`. **Ship early, because history only builds up from deploy day.** DONE 2026-10-12 — `docs/testing/inventory-frozen-cost.tdd.md`. Found: 60/344 costed dishes cost more than their price (unit-price entry errors) → P3/P5 must flag "cost looks wrong" and keep them out of profit totals with a disclosure | M |
| 0c One sales truth | `sales-model.ts`, `money.ts`, `payment-buckets.ts` (commits the uncommitted slices), discount allocation. Fix the POS discount writer, the paging gaps, the Convex `lte` bound and null growth. DONE 2026-10-13 — `docs/testing/reports-sales-model.tdd.md` (engine = independent SQL to the centavo on gungjeon + a refunds store; POS discounts fixed in the DB for every app build). Deferred to P7: app/Convex `revenueGrowth` 0%→null and moving the bill-split session's uncommitted slices (both in another session's files) | M |
| 0d Permissions | `reports`/`inventory`/`costs` across 4 registries, backfills, route maps, guardrail test, fix the inventory revenue leak, "Review staff access" prompt. BUILT 2026-10-14 — `docs/testing/permission-keys.tdd.md`. Keys function APPLIED; the backfill+gates and HIGH-3 (reads AND staff writes) migrations are rehearsed and ship WITH the deploy (prod rejects unknown keys). Daily revenue = net sales | M |
| 0e Test infrastructure | Jest CI workflow, `fast-check`, PGlite installed, fake Supabase with a 1000-row cap and `range`, report-order generator. BUILT 2026-10-14 — `docs/testing/test-infrastructure.tdd.md`. Properties live in `*.property.test.ts` (200 runs per change, 5000 nightly via `FC_NUM_RUNS`); `npm run test:sql` runs every PGlite runner; the CI run itself is unproven until the workflow is pushed | S |

### Phase 1: Sales reports (platform)

- Report RPCs and read layer.
- `/admin/reports` overview: insight sentence, KPIs, trend, totals ledger, `MetricInfo`.
- Breakdowns: items (with the Menu matrix), categories, payments, channels, hours, branches.
- Filter bar, date picker, compare.
- Sidebar restructure. Product Analytics redirect, which also fixes its credential routing.
- **BUILT 2026-10-14** — `docs/testing/reports-phase1-sales.tdd.md`. Functions APPLIED (110000, live as `report_sales_functions`, + the 130000/140000 performance fixes after the 06:52 UTC outage + 150000 payment name aliases); engine = SQL to the centavo (200-store property test + live gungjeon reconciliation). Deviations: native date inputs, no "Save view", no `day_ends_at`, VAT block waits for `vat_registered`, item/category 30-day ≈ 0.7 s (budget 0.6 s). Signed-in Playwright pass done on a local dev server against the live DB (SeaCook owner). Owed: the same pass on a production deploy, the 0d runbook (apply 120100 + 120200) and the app OTA for `allocateCents`.

### Phase 2: Transactions and export

- Transaction history with search and filters, per-day subtotals, cursor paging, drawer.
- Export route (CSV/XLSX), `export_audit`, rate limits, PII masking, Month-end pack.

### Phase 3: Stock home and deliveries

- Stock section, with Stock home sorted by days of cover and the buy list.
- Suppliers, purchase receipts and lines into the ledger.
- Delivery entry: type the total paid, with a keyboard grid.
- Snap-a-resibo pre-fill and private receipt photos.
- Price-change alerts with recipe impact.

### Phase 4: Waste, adjustments, counts

- Reason codes and `adjust`.
- `WasteSheet`: two taps, undo, dish → whole recipe.
- Counts page: blind, grouped by area, resumable.
- Period variance, the "Where your pesos leaked" card, and flagged-count approval (over ₱500 or 5%, not your own count).

### Phase 5: Profit

- COGS and gross profit by period, item and category.
- Waterfall, food-cost band, coverage notes, "include losses" toggle.
- Absorbs the daily report as `?day=`.

### Phase 6: Operations and compliance reports

- Voids, refunds and discounts.
- Cashier/shift report and end-of-day summary.
- VAT block (`vat_registered`).
- SC/PWD discount register, reading `gov_discount_claims`.
- Service-charge payout export.
- Web notification bell and daily close push.
- Accountant seat.

### Phase 7: Coverage and app

- Convex readers for Phases 1–2: windowed `getAllOrderItemsInternal`, a schema bump and Deploy Schema.
- Merchant-app port:
  - RPC refs
  - parity-guarded pure modules
  - camera-first delivery
  - waste sheet opened from the stock-alert push
  - export swap

**Dependencies:**
- 0a–0e come before everything else.
- Phase 1 comes before Phases 2, 5 and 6.
- Phase 0b comes before Phases 4 and 5.
- Phase 3 comes before Phase 4's shared form and the periodic COGS in Phase 5.
- Phase 7 comes last.

---

## 10. Quality gates [QA]

### 10.1 Reconciliation invariants

Property-tested with `fast-check`: 200 runs in CI, 5000 nightly. Everything is in centavos.

1. gross − discounts = net (ledger refunds settle edits; collected − overpaid + unpaid = billed)
2. net + service + delivery = Σ live `orders.total`
3. Σ items = Σ categories = Σ channels = net; Σ branches + Unassigned = store
4. Σ payment types = collected; collected + unpaid = billed
5. Report total = Σ transaction list, for the same filters
6. Σ days = week = month; each order falls on exactly one day
7. Per ingredient: opening + received − sold − waste ± transfers ± count = closing; store = Σ branches
8. COGS = Σ (sale − void) × frozen cost; editing a cost later changes **nothing** in the past
9. Applying the same order twice, or cancel → un-cancel, nets to exactly one deduction
10. Export = screen (parsed back, cell by cell)
11. A paged read = a one-shot read (with a 1001-row fixture)
12. `null` ≠ 0 everywhere

### 10.2 Test layers

| Layer | Where | Tests |
|---|---|---|
| L0 | `tests/unit/reports/*` | Pure engines, 100% coverage on money, period and slices |
| L1 | Property tests | §10.1 invariants |
| L2 | Mocked read seams | Fake Supabase with the cap |
| L3 | PGlite SQL runners | RLS as anon, owner, branch-locked and no-cost staff |
| L4 | `tests/live/reports-live.test.ts` | Read-only against the largest platform tenant; engine = independent SQL to the centavo. Real signed-in users, never the service role |
| L5 | Playwright | Desktop + Pixel 7 + axe |
| Parity | Web↔app, all three payment-slice copies, CSV writers | — |

The QA lead's spec has the full edge-case catalogue (48 cases) and the acceptance criteria per feature. They become the RED tests of each phase.

### 10.3 Security probes on the real DB

Run in `BEGIN; SET LOCAL ROLE …; ROLLBACK;` and **assert affected rows**:

- anon gets 0 rows everywhere
- another tenant gets 0 rows or 42501
- branch-locked staff see 0 rows for other branches and for NULL-outlet rows
- staff without `costs` get 0 cost rows
- forged `created_at`/`created_by`/`sale` is stamped or refused
- UPDATE/DELETE on ledgers affects 0 rows
- deleting a claim affects 0 rows
- export: the 11th in 10 minutes gets 429; each export writes 1 audit row; formula payloads come out inert
- receipt SVG, HTML or 6MB files are refused; signed URLs expire
- the owner still sees everything, which catches over-tightening

### 10.4 Performance budgets

| Measure | Budget |
|---|---|
| Report page TTFB | p95 ≤ 1.2s |
| Report page LCP | ≤ 2.5s, mid-range Android |
| Day RPC | p95 ≤ 150ms |
| Month RPC | p95 ≤ 600ms, `EXPLAIN` shows index use |
| Rows per request | ≤ 5k |
| CSV export | 100k rows ≤ 10s |
| XLSX export | 50k rows ≤ 15s |
| Memory | ≤ 256MB |

All are measured on gungjeon (6.5k orders a month).

### 10.5 Definition of done, per phase

- TDD evidence doc in `docs/testing/` with RED → GREEN.
- Coverage ≥ 80% (100% on money, period and slices).
- Property and parity suites green.
- Migrations applied and probed by object.
- Types regenerated through MCP.
- No new ERROR advisors.
- Role probes pass.
- Live reconciliation passes on the largest tenant.
- `npm run lint`, `tsc`, **`npm run build`**, and one server render per page.
- Playwright desktop and 390px pass, axe clean.
- Excel (Mac/Win) and Google Sheets open the exports.
- Sentry clean for 48 hours.
- Suspect suites re-run alone with `--maxWorkers=1`.
- CLAUDE.md and the memory note updated.

---

## 10.6 Coordination with parallel workstreams (shared tree, several sessions)

| Workstream | Overlap | Rule |
|---|---|---|
| **Store activity + approvals** (`feat/store-activity` worktree, APPROVED; contract `docs/plans/store-activity/contract.md`) | Its Phase 0 security floor covers `order_payments`/`order_revisions` client UPDATE, `stock_movements` insert skipping `menu`, and vouchers ALL policies. It also builds the refunds ledger (`order_refunds`) and an Activity screen under Reports | Our 0a takes ONLY the inventory-ledger holes it doesn't cover (HIGH-1 direct qty/cost UPDATE, HIGH-2 forged reason/sign/backdate, MED-4/6/7, LOW). The two migration sets are sequenced, never written in parallel. Our voids/refunds report **reads** its refund ledger. The audit trail lives in its "Activity" page, not a second one |
| **SC/PWD gov discounts** (planned) | `gov_discount_claims` | We read the claims for the register and VAT-exempt lines. We never write them |
| **Merchant notifications** (uncommitted on `feat/bill-split-tender`) | Low-stock bell | The web bell in Phase 6 reads the same `merchant_notifications`. It is not a second inbox |
| **Bill split tender** (uncommitted, Convex v36) | Payment slices | Phase 0c commits and **moves** these into one shared `payment-buckets.ts`. It doesn't fork a third copy |

We build in our own worktree on a fresh branch, stage explicit paths only, and verify HEAD in a clean worktree.

---

## 11. Decisions for the owner

Recommended defaults are in **bold**.

1. **Fix the three live security HIGHs now** as a standalone change before any feature work? **Yes.**
2. Add the permission keys `reports`, `inventory` and `costs`, with backfills so nobody loses access? **Yes.**
3. The 18 accounts with `menu` but not `analytics`: keep stock and cost, lose the revenue tile? **Yes, with an "Ask the owner for Reports" note.**
4. Convex stores (96) at launch? **Platform first. Convex gets sales reports in Phase 7 through the existing readers. Never half-accurate numbers; show coverage notes.**
5. Retire Product Analytics into Reports → Items? **Yes.**
6. Per-store "day ends at" hour for late-night stores? **Yes, default midnight. `daily_number` resets on the same boundary.**
7. Accountant seat outside the 3-staff cap? **Yes. 90-day renewable, no PII.**
8. Count approval: a hard gate or flags? **Flags only, over ₱500 or 5%. Nobody approves their own count. Owners are exempt.**
9. Orders edited after a day closes? **Show a "restated" marker for now. Freezing with adjustment postings is deferred.**
