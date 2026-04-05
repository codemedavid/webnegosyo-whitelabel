# Product Analytics & Profitability Tracking — Design Spec

> **Goal:** Turn the existing manual BCG classification into a data-driven decision-support system that helps admins decide whether to keep, improve, reprice, or replace menu items — powered by real sales and cost data from Convex.

> **Approach:** Option B (Full Decision Engine), designed to be Option C-ready (cost history, monthly snapshots, what-if simulator can be added later without rework).

> **Constraint:** Convex-only. No Supabase migrations. No changes to existing order flow, cart, checkout, or customer-facing code. Isolated from other developer work.

> **Multi-tenancy:** Convex is deployed per-tenant (each tenant has their own `convex_deployment_url`). Therefore, no `tenantId` field is needed in Convex tables — data isolation is handled at the deployment level.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Existing (no changes)                     │
│                                                             │
│  Supabase: menu_items, tenants, categories (source of truth)│
│  Convex:   orders, orderItems (real-time order data)        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼  (daily cron + on-demand)
┌─────────────────────────────────────────────────────────────┐
│                    New (this feature)                        │
│                                                             │
│  Convex:  productCosts      → admin-entered cost per item   │
│           productAnalytics  → aggregated performance stats  │
│                                                             │
│  Admin UI: cost field on menu item form                     │
│            product analytics page with recommendations      │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model (Convex)

### Table: `productCosts`

Stores cost data per menu item. One record per product (upsert model).

| Field | Type | Purpose |
|---|---|---|
| `menuItemId` | `string` | Links to Supabase menu item ID |
| `costPrice` | `number` | What it costs to make (currency units) |
| `costNotes` | `string?` | Optional admin notes (e.g., "supplier raised price") |
| `updatedAt` | `number` | Last time cost was changed |
| `createdAt` | `number` | First entry timestamp |

**Indexes:** `by_item` (`menuItemId`)

**Option C readiness:** When cost history is needed, change from upsert to append. The `createdAt`/`updatedAt` fields + `menuItemId` index already support querying cost over time.

### Table: `productAnalytics`

Aggregated performance stats per product, recomputed by cron from existing `orderItems` data.

| Field | Type | Purpose |
|---|---|---|
| `menuItemId` | `string` | Links to menu item |
| `period` | `string` | `"7d"`, `"30d"`, `"all"` |
| `totalUnitsSold` | `number` | Total quantity sold |
| `totalRevenue` | `number` | Total revenue generated |
| `totalCost` | `number` | Total COGS (units x costPrice) |
| `totalProfit` | `number` | Revenue - Cost |
| `marginPercent` | `number` | (Profit / Revenue) x 100 |
| `avgDailyUnits` | `number` | Sales velocity |
| `revenueTrend` | `string` | `"growing"`, `"stable"`, `"declining"` |
| `bcgClassification` | `string` | Auto-calculated: `star` / `puzzle` / `plowhorse` / `dog` / `unclassified` |
| `recommendation` | `string` | Rule-based action suggestion |
| `pairingRecommendation` | `string?` | Suggested item to pair/bundle with |
| `pairingItemId` | `string?` | menuItemId of the suggested pair |
| `pairingReason` | `string?` | Why this pairing makes sense |
| `lastOrderDate` | `number?` | Most recent sale (all-time, independent of period filter) |
| `computedAt` | `number` | When this was last calculated |

**Indexes:** `by_item_period` (`menuItemId`, `period`)

**Option C readiness:** The `period` field supports monthly snapshots (e.g., `"2026-03"`) without schema changes. `"all"` means entire order history since the first order — no time limit.

**Display formatting:** All currency values rounded to nearest whole unit. All percentages to 1 decimal place.

---

## BCG Auto-Classification Logic

The system compares each product against the **tenant's median values** (not hardcoded thresholds), so it adapts to each merchant's scale.

```
Median Sales Velocity = median of all eligible products' avgDailyUnits
Median Margin %       = median of all eligible products' marginPercent
```

**Eligibility:** Only products with cost data AND >= 5 orders participate in median calculation and classification. All others default to `"unclassified"`.

**Edge cases:**
- **< 2 eligible products:** All products default to `"unclassified"` (median comparison not meaningful)
- **All products have identical sales/margin:** All are classified as `"dog"` (none exceeds median). This is acceptable — it signals the menu needs differentiation.
- **Negative margin (cost > revenue):** Displayed as-is (e.g., "-12%"). Always classified as low margin.

| Classification | Condition | Description |
|---|---|---|
| **Star** | sales > median AND margin > median | "Best seller, best profit. Your money-maker." |
| **Plowhorse** | sales > median AND margin < median | "Customers love it, but it's eating your profits." |
| **Puzzle** | sales < median AND margin > median | "Great margins, but nobody's ordering it." |
| **Dog** | sales < median AND margin < median | "Low demand, low profit. Time to rethink." |
| **Unclassified** | no cost data OR < 5 orders | "Not enough data yet." |

---

## Rule-Based Recommendations

### Action Recommendations

Each classification generates a specific, actionable recommendation with **real numbers** from the data:

| Classification | Recommendation Template |
|---|---|
| **Star** | "Protect this item. Consider a slight price increase (₱X→₱Y) to maximize profit without losing demand." |
| **Plowhorse** | "Popular but thin margins. Reduce portion cost or raise price by ₱Z to improve profitability. Don't remove — it drives traffic." |
| **Puzzle** | "High profit per sale but low orders. Feature it prominently, add it to upsell pairs, or bundle with a Star item." |
| **Dog** | "Not selling and not profitable. Consider reworking the recipe/price, or replacing with a new item." |
| **Unclassified** | "Add cost price and accumulate orders to unlock insights." |

**Price adjustment formula:** Calculate the price that would achieve the tenant's median margin, assuming current sales volume holds constant:
```
suggestedPrice = costPrice / (1 - medianMarginPercent / 100)
priceDiff      = suggestedPrice - currentPrice
```
Cap suggestion at +/- 20% of current price to keep recommendations realistic. Round to nearest whole currency unit.

### Pairing Recommendations

Each classification includes a suggestion to pair with a specific item from the menu, based on BCG complementary logic from the WebNegosyo Smart Menu Strategy playbook:

| Classification | Pairing Logic | Example |
|---|---|---|
| **Star** | Pair with highest-margin **Puzzle** | "Pair with Leche Flan (Puzzle, 71% margin) as an upsell — your Star's popularity will boost its visibility." |
| **Plowhorse** | Pair with highest-margin **Star or Puzzle** | "Bundle with Halo-Halo (Star, 62% margin) as a meal deal to improve combined margin." |
| **Puzzle** | Pair with highest-sales **Star or Plowhorse** | "Pair with Sinigang (Plowhorse, 12 units/day) — its traffic will expose customers to this high-margin item." |
| **Dog** | Pair with highest-sales **Star** (if keeping) | "If keeping, bundle with Chicken Adobo (Star) as a combo deal to move inventory." |

**Pairing fallbacks:** If the preferred classification has no items (e.g., no Puzzles exist for a Star to pair with), fall back in order: Star > Plowhorse > Puzzle > Dog. In case of tie within a classification, prefer the item with highest units sold. If < 2 classified products exist, no pairing recommendation is generated.

Pairing suggestions are **recommendations only** — the admin decides whether to act by creating the actual upsell pair or bundle via the existing menu engineering features.

---

## Computation & Cron

### Cron Schedule

| Job | When | What |
|---|---|---|
| `aggregateProductAnalytics` | Daily at 16:00 UTC (12:00am PH midnight) | End-of-day product analytics recompute |
| `statsAggregator` (existing, unchanged) | Daily at 23:59 UTC (7:59am PH) | General daily stats aggregation |

Each Convex deployment runs its own cron — no cross-tenant coordination needed.

### Aggregation Steps

**Step 1 — Aggregate sales per product:**
```
For each menuItemId in orderItems (excluding cancelled orders):
  totalUnitsSold = sum(quantity)
  totalRevenue   = sum(subtotal)
  avgDailyUnits  = totalUnitsSold / daysInPeriod
```

**Step 2 — Calculate margin (if cost exists):**
```
costPrice     = productCosts[menuItemId].costPrice
totalCost     = totalUnitsSold × costPrice
totalProfit   = totalRevenue - totalCost
marginPercent = (totalProfit / totalRevenue) × 100
```
If no cost data → `marginPercent = null`, classification = `"unclassified"`
If totalRevenue = 0 → `marginPercent = null`, classification = `"unclassified"`
Negative margins are stored and displayed as-is.

**Step 3 — Determine trend:**
```
Compare current 7-day avgDailyUnits vs previous 7-day:
  if current > previous × 1.1  → "growing"
  if current < previous × 0.9  → "declining"
  else                          → "stable"

If < 14 days of order history exist, default to "stable" (not enough data to compare).
```

**Step 4 — BCG Classification:**
```
medianSales  = median of all products' avgDailyUnits (for this tenant)
medianMargin = median of all products' marginPercent (for this tenant)

Apply classification rules from table above.
```

**Step 5 — Generate recommendations:**
```
Action recommendation: based on classification + actual price/cost/margin numbers
Pairing recommendation: find best complement from opposite BCG quadrant
```

**Step 6 — Store results:**
```
Upsert into productAnalytics — one record per product per period ("7d", "30d", "all")
```

### On-Demand Recompute

Admin can trigger manual recompute via a "Refresh" button on the Product Analytics page. Calls the same aggregation function. Useful when the admin just added cost prices and wants immediate results. Rate-limited to once per minute to prevent abuse.

---

## UI Touch Points

### Touch Point 1: Menu Item Form (Create/Edit Page)

Added below the existing Price / Discounted Price fields:

**New fields:**
- **Cost Price (₱)** — input field for what it costs to make
- **Margin** — auto-calculated live display: `₱90 profit (60%)`

**Performance card (edit page only, if product has orders):**
- Collapsed by default with "View Performance" toggle
- Shows: units sold, revenue, current BCG classification badge, one-line recommendation
- New items (no orders) only see cost field + projected margin — no empty states

### Touch Point 2: Product Analytics Page

New page at `/[tenant]/admin/product-analytics/`

**Top section — Portfolio Summary:**
- 4 cards showing count per BCG classification (Star/Puzzle/Plowhorse/Dog) — same visual style as existing BCG Matrix Quadrant, but with real data-driven numbers
- Overall menu health: "X% of your revenue comes from Stars"
- Alert banner if any Plowhorse has margin below 15%

**Main section — Product Table:**

Sortable, filterable table with all products:

| Column | Data |
|---|---|
| Product Name | Name + category |
| Price | Selling price |
| Cost | Cost price (or "Not set" link) |
| Margin % | Color-coded: green >40%, yellow 20-40%, red <20% |
| Units Sold | Period-selectable (7d / 30d / all) |
| Revenue | Total revenue for period |
| Trend | Arrow icon (growing / stable / declining) |
| BCG Class | Star / Puzzle / Plowhorse / Dog badge |
| Action | "View Details" expands row |

**Expanded row — Recommendations:**
1. Action recommendation with real numbers (e.g., "raise price by ₱15")
2. Pairing suggestion with specific item (e.g., "bundle with Halo-Halo")
3. Direct link to create the upsell pair or bundle

**Period selector:** 7 days / 30 days / All-time — applies to entire table for fair comparison

---

## Files to Create

### Convex Files (`convex-template/convex/`)

| File | Purpose |
|---|---|
| `productCosts.ts` | Mutations: `setCost`, `getCost`, `getAllCosts` |
| `productAnalytics.ts` | Queries: `getAll`, `getByItem`, `getPortfolioSummary`, `getPairingRecommendations` |
| `productAnalyticsAggregator.ts` | Internal function: computes all product analytics |

### App Files

| File | Purpose |
|---|---|
| `src/app/[tenant]/admin/product-analytics/page.tsx` | Product Analytics page |
| `src/components/admin/product-analytics-table.tsx` | Sortable table with expandable recommendation rows |
| `src/components/admin/product-cost-field.tsx` | Cost price input + live margin calculation |
| `src/components/admin/product-mini-performance.tsx` | Collapsible performance card for menu item edit page |

## Files to Modify

| File | Change |
|---|---|
| `convex-template/convex/schema.ts` | Add `productCosts` and `productAnalytics` table definitions |
| `convex-template/convex/crons.ts` | Add `aggregateProductAnalytics` cron at 16:00 UTC |
| Menu item form component | Add `ProductCostField` + `ProductMiniPerformance` below price fields |
| Admin sidebar/navigation | Add "Product Analytics" link |

## Files NOT Touched

- No Supabase migrations
- No changes to existing `orders.ts`, `analytics.ts`, or other Convex functions
- No changes to cart, checkout, or customer-facing code
- No changes to existing menu engineering page or BCG matrix UI

---

## Option C Readiness Summary

Features designed for easy future addition:

| Future Feature | How the current design supports it |
|---|---|
| **Cost history** | Change `productCosts` from upsert to append; aggregator already reads by `menuItemId` — add "use latest cost" logic |
| **Monthly snapshots** | Add `period: "2026-03"` entries to `productAnalytics` — same computation, different date range |
| **What-if simulator** | Reuse margin calculation with hypothetical `costPrice` or `price` parameter — new query, no new tables |
| **Trend comparison** | Monthly snapshots enable "this month vs last month" comparison views |

---

*Created: 2026-03-29*
*Status: Approved*
*Approach: Option B (Full Decision Engine), Option C-ready*
