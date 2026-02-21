# Menu Engineering Overhaul — The Real Deal

> **Goal**: Turn a manual labeling system into a data-driven, psychology-backed menu optimization engine that no competing white-label platform offers.

---

## Table of Contents

1. [Current State (Honest Assessment)](#1-current-state)
2. [Phase 1 — Data Foundation](#2-phase-1--data-foundation)
3. [Phase 2 — Automatic BCG Classification](#3-phase-2--automatic-bcg-classification)
4. [Phase 3 — Psychology Engine](#4-phase-3--psychology-engine)
5. [Phase 4 — Smart Visual Hierarchy](#5-phase-4--smart-visual-hierarchy)
6. [Phase 5 — Intelligent Upselling](#6-phase-5--intelligent-upselling)
7. [Phase 6 — Analytics Dashboard](#7-phase-6--analytics-dashboard)
8. [Phase 7 — Automation & AI](#8-phase-7--automation--ai)
9. [Phase 8 — A/B Testing Framework](#9-phase-8--ab-testing-framework)
10. [Database Migrations Required](#10-database-migrations-required)
11. [Implementation Priority & Dependencies](#11-implementation-priority--dependencies)
12. [Fix Existing Bugs First](#12-fix-existing-bugs-first)

---

## 1. Current State

### What Works
- Feature flag architecture (`menu_engineering_enabled` / `checkout_upsell_enabled`)
- RLS policies on `upsell_pairs`
- Checkout interstitial modal (complementary upsells)
- Complementary suggestion modal (post-add-to-cart)
- Badge rendering on all 6 card templates
- Currency symbol hiding toggle
- Star-priority sorting in menu display
- Admin dashboard with 3-tab layout (BCG / Upsells / Checkout Settings)

### What's Broken
- **Upgrade upsell modal never triggers** — component exists, trigger logic is missing on product detail page
- **Migration mismatch** — `upsell_pairs` table is missing `source_label`, `target_label`, `upgrade_header` columns that the TypeScript types expect
- **Pre-existing build errors** — `mcp/src/index.ts` TS errors, `menu-engineering.ts:92` `never` type cast

### What's Missing (Everything That Matters)
- Zero data collection (no views, no add-to-carts, no conversions)
- Zero analytics (no way to measure anything)
- Manual-only classification (admin guesses which items are Stars)
- No food cost / profit margin fields
- No visual differentiation between BCG categories on the menu
- Only Stars get special sorting treatment; Plowhorses/Puzzles/Dogs are ignored
- No time-awareness (dayparts)
- No customer behavior tracking
- No smart recommendations
- `display_order` and `is_active` fields on upsell_pairs have no admin UI

---

## 2. Phase 1 — Data Foundation

> **Without data, nothing else in this plan works. This is the non-negotiable first step.**

### 2.1 Add `food_cost` to Menu Items

Every menu engineering framework in the restaurant industry requires knowing the **contribution margin** (selling price minus food cost). Without it, profitability classification is impossible.

**Schema change:**
```sql
ALTER TABLE menu_items ADD COLUMN food_cost DECIMAL(10,2) DEFAULT NULL;
```

**Admin UI change:**
- Add "Food Cost" field to the menu item form (`menu-item-form.tsx`)
- Show it next to price/discounted_price
- Optional field — items without food_cost fall back to manual classification
- Display contribution margin in real-time: `Margin = Price - Food Cost`
- Show margin percentage: `(Price - Food Cost) / Price * 100`

### 2.2 Event Tracking Table

Track what matters. Lightweight, append-only, designed for aggregation.

```sql
CREATE TABLE menu_item_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,  -- 'view', 'add_to_cart', 'purchase', 'upsell_impression', 'upsell_accept', 'upsell_dismiss'
  session_id TEXT,           -- Anonymous session ID (no PII)
  metadata JSONB DEFAULT '{}',  -- Flexible: { source: 'menu'|'upsell'|'search', upsell_pair_id: '...', quantity: 1, revenue: 150.00 }
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast aggregation
CREATE INDEX idx_events_tenant_item ON menu_item_events(tenant_id, menu_item_id);
CREATE INDEX idx_events_tenant_type ON menu_item_events(tenant_id, event_type);
CREATE INDEX idx_events_created ON menu_item_events(created_at);
CREATE INDEX idx_events_session ON menu_item_events(session_id);
```

**Events to track:**

| Event | When | Metadata |
|-------|------|----------|
| `view` | Product detail page opened | `{ source: 'menu' \| 'search' \| 'upsell' }` |
| `add_to_cart` | Item added to cart | `{ quantity, source: 'direct' \| 'upsell_complementary' \| 'upsell_upgrade', price }` |
| `remove_from_cart` | Item removed from cart | `{ quantity }` |
| `purchase` | Order completed (checkout) | `{ quantity, revenue, order_id }` |
| `upsell_impression` | Upsell modal/suggestion shown | `{ upsell_pair_id, pair_type, context: 'product_detail' \| 'checkout' }` |
| `upsell_accept` | User clicked "Add" on upsell | `{ upsell_pair_id, pair_type, target_item_id }` |
| `upsell_dismiss` | User closed/skipped upsell | `{ upsell_pair_id, pair_type }` |

### 2.3 Aggregated Metrics (Materialized View or Cron)

Raw events are for flexibility. Aggregated metrics are for speed. Compute daily.

```sql
CREATE TABLE menu_item_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'

  -- Popularity metrics
  view_count INTEGER DEFAULT 0,
  add_to_cart_count INTEGER DEFAULT 0,
  purchase_count INTEGER DEFAULT 0,
  total_quantity_sold INTEGER DEFAULT 0,

  -- Revenue metrics
  total_revenue DECIMAL(10,2) DEFAULT 0,
  total_profit DECIMAL(10,2) DEFAULT 0,  -- revenue - (food_cost * quantity)

  -- Conversion funnel
  view_to_cart_rate DECIMAL(5,4) DEFAULT 0,    -- add_to_cart / views
  cart_to_purchase_rate DECIMAL(5,4) DEFAULT 0, -- purchase / add_to_cart

  -- Upsell metrics
  upsell_impressions INTEGER DEFAULT 0,
  upsell_accepts INTEGER DEFAULT 0,
  upsell_revenue DECIMAL(10,2) DEFAULT 0,

  UNIQUE(tenant_id, menu_item_id, period_start, period_type)
);
```

### 2.4 Session Tracking (Lightweight, No PII)

Generate an anonymous session ID client-side (stored in sessionStorage, not localStorage — dies when tab closes). Use this for:
- Funnel analysis (viewed → added → purchased)
- Co-browsing patterns (what items are viewed together)
- Cart abandonment detection

```typescript
// src/lib/session.ts
export function getSessionId(): string {
  let id = sessionStorage.getItem('me_session');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('me_session', id);
  }
  return id;
}
```

### 2.5 Event Collection API

Create a lightweight edge function or API route for batched event ingestion. Events are fire-and-forget from the client (non-blocking, queued via `navigator.sendBeacon` or debounced fetch).

```
POST /api/events
Body: { events: [{ event_type, menu_item_id, metadata, session_id }] }
```

- Batch events client-side (flush every 5 seconds or on page unload)
- Server validates tenant_id from auth context
- Insert via Supabase admin client (bypasses RLS for write performance)
- RLS on reads: admins see their tenant's events only

### 2.6 Backfill from Existing Orders

If `enable_order_management` is ON, there's existing order history in the `orders` table. Write a one-time backfill script that:
1. Scans all orders for the tenant
2. Extracts `items[]` from each order
3. Creates `purchase` events and populates `menu_item_metrics` for historical data
4. Gives the admin immediate value on day one

---

## 3. Phase 2 — Automatic BCG Classification

### 3.1 The Real BCG Algorithm

Once food_cost exists and events are tracked, classification becomes math:

```
Contribution Margin = Price - Food Cost
Menu Mix % = (Item Quantity Sold / Total Items Sold) * 100
Average Mix % = 100 / Number of Items (the "fair share" threshold)
Average Margin = Sum of All Margins / Number of Items

Star:      Mix% >= Average Mix%  AND  Margin >= Average Margin
Plowhorse: Mix% >= Average Mix%  AND  Margin <  Average Margin
Puzzle:    Mix% <  Average Mix%  AND  Margin >= Average Margin
Dog:       Mix% <  Average Mix%  AND  Margin <  Average Margin
```

This is the textbook Kasavana-Smith model used by every hospitality program in the world.

### 3.2 Auto-Classification Service

```typescript
// New function in menu-engineering-service.ts
async function autoClassifyItems(tenantId: string, periodDays: number = 30) {
  // 1. Get all items with food_cost set
  // 2. Get purchase metrics for the period
  // 3. Calculate menu mix % and contribution margin for each
  // 4. Determine thresholds (averages)
  // 5. Classify each item
  // 6. Return classifications with confidence score
  // 7. Optionally auto-apply (or return as suggestions for admin to review)
}
```

### 3.3 Classification Confidence

Not all classifications are equal. An item sold 500 times has a reliable classification. An item sold 3 times doesn't. Show confidence levels:

- **High confidence**: 50+ orders in period, food_cost set
- **Medium confidence**: 10-49 orders, food_cost set
- **Low confidence**: <10 orders OR food_cost missing
- **Manual override**: Admin explicitly set this (ignore auto)

### 3.4 Admin Experience

The BCG Matrix tab transforms:
- **Before**: Admin picks from dropdown for each item
- **After**: System shows auto-calculated classification with confidence badge
  - "Star (High Confidence) — 234 orders, 62% margin"
  - "Auto-classified 3 days ago — Override?"
  - Items without food_cost show: "Set food cost to enable auto-classification"
  - Quadrant chart becomes a REAL scatter plot: X-axis = popularity (mix%), Y-axis = profitability (margin%)
  - Each dot is an item, sized by revenue
  - Admins can drag items between quadrants to override

### 3.5 Recalculation Schedule

- **Daily**: Aggregate previous day's events into `menu_item_metrics`
- **Weekly**: Recalculate BCG classifications for all items with sufficient data
- **On demand**: Admin can trigger recalculation from dashboard
- Implemented via: Supabase cron (pg_cron) or Edge Function on a schedule

---

## 4. Phase 3 — Psychology Engine

> **Every principle must be backed by research and implemented with nuance, not just a toggle.**

### 4.1 Price Psychology (Beyond Currency Hiding)

**Research basis**: Cornell University, Sybil Yang (2009) — removing dollar signs increased average spend by 8%.

Current: Boolean toggle to hide currency symbol. That's step 1 of 10.

**Full implementation:**

| Technique | What It Does | Implementation |
|-----------|-------------|----------------|
| **Currency symbol removal** | Already done | `hide_currency_symbol` toggle |
| **Charm pricing** | Prices ending in .99/.95 feel cheaper | Admin toggle + auto-suggestion: "Change 150.00 → 149.95?" |
| **Nested pricing** | Don't list prices in a column (creates "shopping list" scanning) | Card templates should NOT right-align prices. Embed price in description flow |
| **Price anchoring** | Place high-price item first in each category so others seem reasonable | Auto-sort: within each category, place highest-priced item first (configurable) |
| **Decoy pricing** | Add a third option that makes the target look like better value | For items with size variations: suggest adding a "decoy" size in admin dashboard |
| **No trailing zeros** | "12" feels less than "12.00" | Toggle: Show `125` instead of `125.00` when price is a whole number |
| **Round prices for emotional purchases** | Round numbers ($20) feel right for indulgence. Precise numbers ($19.85) feel right for rational purchases | Auto-suggest round prices for "indulgence" tagged categories |

**Admin UI**: "Price Psychology" section in checkout settings tab. Toggles for each technique with explanation tooltips showing the research.

### 4.2 Anchoring & Decoy Effect

**Research basis**: Dan Ariely, *Predictably Irrational* — the decoy effect increases target option selection by 30-40%.

**Implementation:**
- When displaying items in a category, if menu engineering is enabled:
  - Place the highest-margin item (Puzzle) adjacent to a similar but slightly inferior option
  - Place an expensive anchor item at the top of each category
  - The admin dashboard shows: "Suggested anchor: [Wagyu Burger - P850] for category [Burgers]"
- For items with variations (size: S/M/L):
  - Identify if the middle option has the best margin
  - If so, suggest making the large option slightly more expensive to push people to medium
  - Show: "Your Medium Burger has 65% margin. Consider pricing Large at P320 (currently P280) to make Medium more attractive."

### 4.3 Social Proof (Real, Not Fake)

**Research basis**: Cialdini's *Influence* — people follow the crowd, especially under uncertainty.

Current: Admin manually types "Best Seller" as badge text. No proof it's actually best-selling.

**Implementation:**
- **Auto-generated badges based on real data:**
  - "Popular" — item is in top 20% by order volume (last 30 days)
  - "Trending" — item's orders increased 25%+ week-over-week
  - "Best Seller" — #1 item by order volume in its category
  - "New" — item created within last 14 days
  - "Back by Demand" — item was unavailable and is now available again
- **Order count display** (optional toggle):
  - Show "500+ ordered" on items with high volume
  - Uses rounded/bucketed numbers (not exact) to feel organic
  - Only shown when count exceeds a threshold (e.g., 20+ orders)
- **"People also ordered" section** on product detail page:
  - Based on actual co-purchase data from `menu_item_events`
  - Not manually configured upsell pairs
- Admin can override/disable any auto-badge per item

### 4.4 Scarcity & Urgency

**Research basis**: Cialdini — scarcity increases perceived value. Worchel jar study (1975).

**Implementation (ethical, not manipulative):**
- **Limited availability** — admin can set `daily_limit` on items. Show "Only X left today" when stock is low
- **Time-limited offers** — admin can set start/end dates for menu items or discounts
  - Show countdown: "Available until 2:00 PM" for lunch specials
- **Seasonal tags** — "Limited Time" badge for items with end dates
- This is NOT fake scarcity — it reflects real operational constraints

```sql
ALTER TABLE menu_items ADD COLUMN daily_limit INTEGER DEFAULT NULL;
ALTER TABLE menu_items ADD COLUMN available_from TIME DEFAULT NULL;
ALTER TABLE menu_items ADD COLUMN available_until TIME DEFAULT NULL;
ALTER TABLE menu_items ADD COLUMN promo_start_date DATE DEFAULT NULL;
ALTER TABLE menu_items ADD COLUMN promo_end_date DATE DEFAULT NULL;
```

### 4.5 The Golden Triangle & Menu Layout Psychology

**Research basis**: Eye-tracking studies (Gallup, Korean Restaurant Association) show diners' eyes follow a predictable pattern — center first, then upper-right, then upper-left. This is the "golden triangle."

Current: Items are displayed in a flat grid with simple sort order.

**Implementation:**
- For grid layouts (2-3 columns), the first item position IS the golden triangle
- Stars and Puzzles should occupy the first 2-3 positions in each category
- Plowhorses should be positioned in the middle (they sell themselves)
- Dogs should be at the bottom or hidden
- New sorting algorithm:

```
Priority within each category:
1. Stars (high profit, high popularity — protect and highlight)
2. Puzzles (high profit, low popularity — give them visibility)
3. Plowhorses (low profit, high popularity — they don't need help)
4. Dogs (low profit, low popularity — bury or remove)
5. Unclassified items by manual order
```

### 4.6 Description Psychology

**Research basis**: Brian Wansink, Cornell — descriptive menu labels increased sales by 27% and improved taste ratings.

**Implementation:**
- **Sensory language suggestions**: When admin writes a description, show AI-powered suggestions
  - "Grilled Chicken" → "Flame-grilled, herb-crusted chicken breast"
  - Suggest adjectives: crispy, smoky, velvety, hand-crafted, slow-roasted
- **Provenance labels**: Suggest adding origin ("Batangas beef", "locally sourced vegetables")
- **Nostalgia triggers**: "Grandma's recipe", "classic homestyle"
- This is Phase 7 (AI) territory but the data model should support it now:

```sql
ALTER TABLE menu_items ADD COLUMN ai_description_suggestion TEXT DEFAULT NULL;
```

### 4.7 Loss Aversion in Cart

**Research basis**: Kahneman & Tversky — losses feel 2x more painful than equivalent gains.

**Implementation:**
- When user removes item from cart, show: "You'll miss out on [item name]" with undo option
- When cart has been idle for a while: "Your [item name] is waiting — complete your order?"
- Checkout interstitial reframe: Instead of "You might also like these" → "Don't miss these items that go perfectly with your order"

---

## 5. Phase 4 — Smart Visual Hierarchy

> **Different BCG classifications should LOOK different on the menu. Currently they all look identical.**

### 5.1 Star Items — The Heroes

Stars are your money-makers. They should command attention.

- **Larger card variant**: Stars get 1.5x card size in grid (span 2 columns on desktop, full-width on mobile)
- **Image emphasis**: If item has an image, show it larger with slight zoom-on-hover
- **Badge**: Auto-generated gold "Best Seller" or "Popular" badge
- **Border/glow**: Subtle brand-color border or shadow to make them pop
- **Description shown**: Unlike other cards that may truncate, Stars show full description

### 5.2 Puzzle Items — The Hidden Gems

High margin but low popularity. The goal is to increase their visibility.

- **"Chef's Pick" badge**: Auto-applied to draw attention
- **Description shown**: Full description visible to sell the item
- **Positioned after Stars**: Second-priority placement
- **Highlight treatment**: Subtle background tint or "recommended" ribbon
- **Pairing suggestions shown inline**: "Goes great with [Star item]" on the card itself

### 5.3 Plowhorse Items — The Workhorses

Popular but low margin. Don't need promotion — need margin improvement.

- **Standard card size**: No special visual treatment
- **No promotional badges**: They sell themselves
- **Admin insights**: Dashboard shows "Consider raising price by P10-20" or "Bundle with high-margin side"
- **Variation nudges**: If item has sizes, default-select the higher-margin size

### 5.4 Dog Items — The Problem Children

Low margin, low popularity. Either fix them or remove them.

- **Bottom of category**: Sorted last
- **Compact display**: Smaller card variant or text-only listing
- **No image prominence**: Thumbnail only
- **Admin alerts**: "This item had 2 orders in 30 days. Consider removing or repricing."
- **Option to auto-hide**: Toggle in dashboard: "Auto-hide Dogs from menu" (sets `is_available = false`)

### 5.5 Card Template Variants

Each of the 6 card templates (classic, minimal, modern, elegant, compact, bold) needs:
- A `featured` variant (for Stars — larger, more prominent)
- A `highlighted` variant (for Puzzles — subtle emphasis)
- A `compact` variant (for Dogs — minimal footprint)
- Standard variant stays as-is (for Plowhorses and Unclassified)

This is done via a `displayVariant` prop: `'standard' | 'featured' | 'highlighted' | 'compact'`

The menu grid component checks `bcg_classification` and assigns the variant:
```typescript
function getDisplayVariant(classification: BcgClassification): CardVariant {
  switch (classification) {
    case 'star': return 'featured';
    case 'puzzle': return 'highlighted';
    case 'dog': return 'compact';
    default: return 'standard';
  }
}
```

---

## 6. Phase 5 — Intelligent Upselling

### 6.1 Fix What's Broken First

1. **Wire up the upgrade modal** — The `UpgradeUpsellModal` component exists but is never triggered. On the product detail page, after "Add to Cart":
   - Check if upgrade pairs exist for this item
   - If yes, show `UpgradeUpsellModal` first
   - If user upgrades, add the upgraded item instead
   - If user declines, proceed to complementary suggestions

2. **Add missing migration columns** — `source_label`, `target_label`, `upgrade_header` need to be added to `upsell_pairs` table

3. **Wire up `display_order`** — Add drag-and-drop reordering in admin
4. **Wire up `is_active` toggle** — Add on/off switch per pair in admin

### 6.2 Smart Complementary Suggestions (Data-Driven)

Current: Manually configured pairs only.

**Upgrade: Auto-suggest pairs based on co-purchase data.**

```typescript
async function getAutoComplementaryItems(tenantId: string, itemId: string) {
  // Query menu_item_events: find items that were purchased in the same order
  // as `itemId` most frequently
  // Rank by co-occurrence frequency
  // Exclude items already in cart
  // Return top N suggestions
}
```

- **Hybrid approach**: Manual pairs take priority, auto-suggestions fill remaining slots
- **Admin sees**: "Auto-suggested pairings based on 150 co-purchases. [Approve] [Dismiss]"
- Auto-suggestions appear in the Upsell Pairs tab with an "Auto" badge

### 6.3 Context-Aware Upselling

Instead of showing the same upsells every time:

| Context | Strategy |
|---------|----------|
| **Small order** (< average order value) | Suggest high-value Star items: "Complete your meal?" |
| **Large order** | Suggest desserts/drinks (low-cost add-ons): "Add a drink for just P49?" |
| **Lunchtime** (11am-2pm) | Suggest meal combos, quick items |
| **Dinner** (5pm-9pm) | Suggest appetizers, sides, premium items |
| **Returning customer** | "You loved [X] last time. Try [Y] this time?" (requires customer identification) |
| **First-time visitor** | Show Star items — proven sellers reduce choice anxiety |

Requires: `available_from`/`available_until` on items, session tracking, order history lookup.

### 6.4 Upsell Conversion Tracking

Every upsell modal interaction creates an event:
- `upsell_impression` — modal shown
- `upsell_accept` — user added suggested item
- `upsell_dismiss` — user closed/skipped

Dashboard shows:
- Upsell conversion rate per pair
- Revenue attributed to upsells
- Best/worst performing pairs
- Auto-disable pairs with <2% conversion after 100+ impressions

### 6.5 Checkout Interstitial Improvements

Current: Show complementary items + Star items. Good start.

**Improvements:**
- **Prioritize by margin**: Sort suggestions by contribution margin, not arbitrary order
- **Show savings**: "Add [item] and save P30 on your next order" (if applicable)
- **Social proof on suggestions**: "Ordered 200+ times this week"
- **Limit fatigue**: Track how many times a user has seen the interstitial (via session). Don't show it every time — every other checkout, or only when there are strong matches
- **Urgency framing**: "Special offer with your order" header option

---

## 7. Phase 6 — Analytics Dashboard

> **The admin needs to SEE the impact. No visibility = no trust = feature abandoned.**

### 7.1 Overview Cards (Top of Dashboard)

| Card | Metric | Comparison |
|------|--------|------------|
| Total Revenue (30d) | Sum of order totals | vs. previous 30d (% change) |
| Avg Order Value | Total revenue / order count | vs. previous period |
| Upsell Revenue | Revenue from upsell-accepted items | vs. previous period |
| Upsell Conversion | Accepts / impressions | vs. previous period |
| Menu Score | Weighted composite (see below) | vs. previous period |

### 7.2 Menu Score

A single number (0-100) that tells the admin "how optimized is your menu?"

Components:
- **Data completeness** (20%): % of items with food_cost set, % with images, % with descriptions
- **Classification health** (20%): % of items classified with high confidence
- **Star performance** (20%): Are Stars actually top sellers? (Star items should be in top 30% by volume)
- **Upsell effectiveness** (20%): Upsell conversion rate > 5%
- **Price psychology** (20%): Currency hiding on, charm pricing adopted, anchoring in place

Show as a radial progress bar with breakdown.

### 7.3 BCG Scatter Plot (Interactive)

Replace the static quadrant grid with a real scatter plot:
- **X-axis**: Menu Mix % (popularity)
- **Y-axis**: Contribution Margin % (profitability)
- **Dot size**: Revenue generated
- **Dot color**: Current classification
- **Crosshairs**: Average mix % (vertical line) and average margin (horizontal line)
- **Hover**: Item name, exact metrics, classification
- **Click**: Jump to item detail
- **Time slider**: See how items moved across quadrants over time

### 7.4 Item Performance Table

Sortable table with columns:
| Column | Description |
|--------|-------------|
| Item | Name + thumbnail |
| Category | Category name |
| Classification | Star/Plowhorse/Puzzle/Dog with color badge |
| Confidence | High/Medium/Low |
| Orders (30d) | Purchase count |
| Revenue (30d) | Total revenue |
| Margin | Contribution margin % |
| Views → Cart | View-to-cart conversion rate |
| Cart → Purchase | Cart-to-purchase rate |
| Trend | Sparkline (last 30 days) |
| Actions | Reclassify, Edit, Hide |

### 7.5 Upsell Performance Report

| Column | Description |
|--------|-------------|
| Source Item | What triggers the upsell |
| Target Item | What's suggested |
| Type | Complementary / Upgrade |
| Impressions | Times shown |
| Conversions | Times accepted |
| Conv. Rate | % |
| Revenue | Total from conversions |
| Status | Active / Auto-disabled / Manual |

### 7.6 Revenue Attribution

Show the admin exactly how much money menu engineering made them:
- "Revenue from Star item prioritization: +P12,500 (estimated)"
- "Revenue from upsells: P8,200 (tracked)"
- "Revenue from Puzzle item promotion: +P3,100 (estimated)"

Estimation method: Compare item performance before/after classification change (simple before/after, not causal inference — keep it honest).

### 7.7 Actionable Recommendations

The dashboard should tell admins what to DO, not just show numbers:

- "5 items have no food cost set. [Set food costs →]"
- "Adobo Rice has been a Dog for 3 months. Consider removing it. [Hide item] [Keep]"
- "Iced Tea is a Plowhorse with 15% margin. Raising price by P5 would increase margin to 22%. [Update price]"
- "Chicken Burger and Fries are purchased together 73% of the time but have no upsell pair. [Create pair]"
- "Your menu has 0 Puzzle items. Consider adding a premium item to each category."

These are generated by analyzing metrics and applying simple rules (not AI).

---

## 8. Phase 7 — Automation & AI

### 8.1 Auto-Badge System

Rules engine that auto-assigns badges based on real data:

```typescript
const BADGE_RULES = [
  {
    condition: (item) => item.purchaseRank <= 0.1, // Top 10%
    badge: 'Best Seller',
    priority: 1
  },
  {
    condition: (item) => item.weekOverWeekGrowth >= 0.25,
    badge: 'Trending',
    priority: 2
  },
  {
    condition: (item) => item.daysSinceCreated <= 14,
    badge: 'New',
    priority: 3
  },
  {
    condition: (item) => item.bcgClassification === 'puzzle' && item.marginPct >= 0.5,
    badge: "Chef's Pick",
    priority: 4
  },
];
// Highest priority badge wins. Admin overrides always take precedence.
```

Admin settings:
- Toggle auto-badges on/off globally
- Override per-item (manual badge always wins)
- Preview what auto-badges would look like before enabling

### 8.2 Auto-Reclassification Alerts

When the system detects an item has moved quadrants:
- Admin notification: "Chicken Wings moved from Star to Plowhorse (margin dropped 12% this month)"
- Suggested action: "Review pricing or reduce food cost"
- Auto-reclassify after 2 consecutive weeks of data supporting the change

### 8.3 AI Description Enhancement (Optional / Future)

Use an LLM API to suggest description improvements:
- Input: Item name, category, current description, price
- Output: Sensory-rich description following Wansink's research
- Admin reviews and approves/edits before publishing
- Store in `ai_description_suggestion` field

### 8.4 Smart Menu Reordering

Weekly auto-reorder within categories based on:
1. BCG classification priority (Stars → Puzzles → Plowhorses → Dogs)
2. Within same classification: by contribution margin (descending)
3. Admin can lock specific items to fixed positions

```sql
ALTER TABLE menu_items ADD COLUMN order_locked BOOLEAN DEFAULT false;
```

---

## 9. Phase 8 — A/B Testing Framework

> **You can't improve what you don't test. Give admins the power to experiment.**

### 9.1 Simple Variant Testing

Start simple: test one thing at a time.

```sql
CREATE TABLE menu_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Test: Higher price on Chicken Burger"
  experiment_type TEXT NOT NULL,          -- 'price', 'description', 'image', 'badge', 'position'
  menu_item_id UUID REFERENCES menu_items(id),
  variant_a JSONB NOT NULL,              -- { price: 150 }
  variant_b JSONB NOT NULL,              -- { price: 175 }
  traffic_split DECIMAL(3,2) DEFAULT 0.5, -- 50/50
  status TEXT DEFAULT 'draft',           -- 'draft', 'running', 'completed', 'cancelled'
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner TEXT,                           -- 'a', 'b', 'inconclusive'
  results JSONB,                         -- { a: { orders: 45, revenue: 6750 }, b: { orders: 52, revenue: 9100 } }
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 9.2 How It Works

1. Admin creates experiment: "Test Chicken Burger at P175 vs current P150"
2. System assigns visitors to variant A or B based on session ID hash
3. Variant B visitors see modified price/description/badge
4. After sufficient data (configurable, default: 100 orders or 2 weeks), system calculates winner
5. Admin can auto-apply winner or review first

### 9.3 What Can Be Tested

- **Price**: Different prices for the same item
- **Description**: Original vs enhanced description
- **Badge**: "Best Seller" vs "Chef's Pick" vs no badge
- **Image**: Different hero images
- **Position**: Star-first sort vs manual sort

### 9.4 Results Dashboard

- Conversion rate per variant with confidence interval
- Revenue per variant
- Statistical significance indicator (simple chi-squared test)
- "Not enough data yet" warning when sample is too small
- One-click "Apply Winner" button

---

## 10. Database Migrations Required

### Migration 1: Fix Existing Issues
```sql
-- Add missing columns to upsell_pairs (migration mismatch)
ALTER TABLE upsell_pairs ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE upsell_pairs ADD COLUMN IF NOT EXISTS target_label TEXT;
ALTER TABLE upsell_pairs ADD COLUMN IF NOT EXISTS upgrade_header TEXT;
```

### Migration 2: Data Foundation
```sql
-- Food cost on menu items
ALTER TABLE menu_items ADD COLUMN food_cost DECIMAL(10,2);

-- Event tracking
CREATE TABLE menu_item_events (...);

-- Aggregated metrics
CREATE TABLE menu_item_metrics (...);

-- Indexes
...
```

### Migration 3: Psychology & Scarcity
```sql
ALTER TABLE menu_items ADD COLUMN daily_limit INTEGER;
ALTER TABLE menu_items ADD COLUMN available_from TIME;
ALTER TABLE menu_items ADD COLUMN available_until TIME;
ALTER TABLE menu_items ADD COLUMN promo_start_date DATE;
ALTER TABLE menu_items ADD COLUMN promo_end_date DATE;
ALTER TABLE menu_items ADD COLUMN ai_description_suggestion TEXT;
ALTER TABLE menu_items ADD COLUMN order_locked BOOLEAN DEFAULT false;

-- Tenant-level psychology settings
ALTER TABLE tenants ADD COLUMN charm_pricing_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN show_order_counts BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN order_count_threshold INTEGER DEFAULT 20;
ALTER TABLE tenants ADD COLUMN auto_badges_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN auto_sort_enabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN price_anchoring_enabled BOOLEAN DEFAULT false;
```

### Migration 4: A/B Testing
```sql
CREATE TABLE menu_experiments (...);
```

---

## 11. Implementation Priority & Dependencies

### Dependency Graph

```
Phase 1 (Data Foundation)
  ├── food_cost field
  ├── event tracking table + API
  ├── session tracking (client-side)
  ├── backfill from existing orders
  └── aggregation cron/function
        │
        ├── Phase 2 (Auto BCG) ← needs event data + food_cost
        │     │
        │     └── Phase 4 (Visual Hierarchy) ← needs classifications
        │           │
        │           └── Phase 8 (A/B Testing) ← needs visual variants to test
        │
        ├── Phase 5 (Smart Upselling) ← needs event data for co-purchase analysis
        │     │
        │     └── Phase 6 (Analytics Dashboard) ← needs all data flowing
        │
        └── Phase 7 (Automation & AI) ← needs analytics to trigger rules

Phase 3 (Psychology Engine) ← mostly independent, can start in parallel
```

### Recommended Build Order

| Order | Phase | Effort | Impact | Notes |
|-------|-------|--------|--------|-------|
| **0** | Fix bugs | 1 day | Critical | Upgrade modal trigger, migration mismatch, build errors |
| **1** | Phase 1.1 | 1 day | High | Add `food_cost` field + admin UI |
| **2** | Phase 1.2-1.5 | 3-4 days | Critical | Event tracking system (table, API, client SDK) |
| **3** | Phase 1.6 | 1 day | Medium | Backfill from existing orders |
| **4** | Phase 2 | 3 days | Very High | Auto BCG classification — this is the "wow" moment |
| **5** | Phase 3.1-3.3 | 2-3 days | High | Price psychology + social proof (real badges) |
| **6** | Phase 4 | 3-4 days | Very High | Visual hierarchy (Star/Puzzle/Dog card variants) |
| **7** | Phase 5 | 3-4 days | High | Smart upselling + co-purchase analysis |
| **8** | Phase 6 | 4-5 days | Very High | Analytics dashboard (scatter plot, metrics, recs) |
| **9** | Phase 3.4-3.7 | 2 days | Medium | Scarcity, golden triangle, loss aversion |
| **10** | Phase 7 | 2-3 days | Medium | Auto-badges, auto-reorder, reclassification alerts |
| **11** | Phase 8 | 4-5 days | High | A/B testing framework |

**Total estimated scope: ~30-35 days of focused work.**

---

## 12. Fix Existing Bugs First

Before building anything new, fix what's broken:

### Bug 1: Upgrade Modal Never Triggers
- **File**: `src/components/customer/product-detail-content.tsx`
- **Issue**: `UpgradeUpsellModal` is imported and rendered, but the state management / trigger logic after "Add to Cart" doesn't properly open it when upgrade pairs exist
- **Fix**: In the add-to-cart handler, check if `upgradeUpsells.length > 0`, and if so, show the upgrade modal before the complementary suggestions modal

### Bug 2: Migration Missing Columns
- **File**: `supabase/migrations/20260207000001_menu_engineering.sql`
- **Issue**: `source_label`, `target_label`, `upgrade_header` columns are in TypeScript types but not in the migration
- **Fix**: New migration to add these columns

### Bug 3: Build Errors
- `mcp/src/index.ts` — MCP SDK type errors (pre-existing, not menu engineering)
- `src/app/actions/menu-engineering.ts:92` — `never` type cast issue
- **Fix**: Address the type cast in menu-engineering.ts; MCP errors are separate concern

### Bug 4: display_order and is_active Have No UI
- **File**: `src/components/admin/menu-engineering-dashboard.tsx`
- **Issue**: Fields exist in DB but no way to set them in admin
- **Fix**: Add drag-to-reorder and active/inactive toggle in the Upsell Pairs tab

---

## Summary

The current menu engineering is a manual labeling system. The plan above transforms it into:

1. **Data-driven** — Real metrics from real orders, not admin guesses
2. **Automated** — Classifications, badges, and suggestions update themselves
3. **Psychology-backed** — Every technique tied to published research
4. **Visually differentiated** — Items look different based on their strategic role
5. **Measurable** — Admins see exactly what's working and what isn't
6. **Intelligent** — Co-purchase analysis, context-aware upselling, smart reordering
7. **Testable** — A/B testing lets admins experiment with confidence
8. **Actionable** — Dashboard tells admins what to DO, not just what happened

No white-label restaurant platform offers this. Most don't even have manual BCG classification. Building this end-to-end would be a genuine competitive moat.
