# Smart Upsell Hub — Design Spec

**Date**: 2026-03-28
**Status**: Draft
**Approach**: B (Smart Upsell Hub) with elements of A (Boost Sales wizard)

## Problem Statement

The current upsell system is powerful but fragmented and abstract. Small restaurant owners face three core issues:

1. **Fragmented admin experience** — Upsell configuration is scattered across 4 separate tabs (BCG matrix, upsell pairs, bundles, checkout settings) with no unified view of the customer experience.
2. **Abstract terminology** — BCG classification labels (star, plowhorse, puzzle, dog) and strategy names ("Plowhorse → Star: Boost Margin") are meaningless to typical restaurant owners.
3. **No orchestration** — Customer-facing upsell components fire independently with no coordination, leading to irrelevant suggestions and potential "modal gauntlet" fatigue.

## Goals

- **Admin**: Single unified page where merchants manage all upsell activity using plain, action-oriented language. Merchants should be able to set up effective upsells in under 5 minutes.
- **Customer**: Upsell suggestions feel relevant and helpful, not spammy. Max 2 interruptions per order session.
- **Business**: Increase upsell acceptance rates and AOV lift by improving relevance and reducing fatigue.

## Target User

Small restaurant owners with mid-level tech-savviness. They want to "push items" and see results — not learn marketing theory. They still want visibility into what's happening, but through simple language.

---

## 1. Smart Upsell Hub (Admin Page Restructure)

### Route

Replace or rename the current menu-engineering page. New primary entry point: `/[tenant]/admin/boost-sales/` (sidebar nav item: "Boost Sales").

The existing `/[tenant]/admin/menu-engineering/` route can redirect to the new page. The BCG matrix visualization can remain accessible as an "Advanced" view for superadmins or power users.

### Page Layout

```
┌─────────────────────────────────────────────────────┐
│  Boost Sales                          [👁 Preview]  │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ┌─── Quick Stats Bar ───────────────────────────┐  │
│  │ Upsell Revenue: ₱12,340  │  Acceptance Rate:  │  │
│  │ 23%  │  AOV Lift: +₱45  │  Active Items: 8   │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─── Quick-Add Bar ────────────────────────────┐  │
│  │  "What do you want to sell more of?"          │  │
│  │  [🔍 Search menu items...]                    │  │
│  │  Suggestion tiles: [Best Sellers] [Hidden     │  │
│  │  Gems] [Slow Movers] [Not in any upsell]     │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  Tabs: [Combos & Bundles] [Pair Suggestions]       │
│         [Checkout Picks] [Performance]              │
│                                                     │
│  ┌─── Active Tab Content ────────────────────────┐  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Quick Stats Bar

Pulls from existing Convex analytics (`getUpsellAnalytics`, `getBundleAnalytics`):
- **Upsell Revenue**: Total revenue attributed to upsold items (last 30 days)
- **Acceptance Rate**: `upsell_clicked / upsell_shown` across all sources
- **AOV Lift**: Average order value with upsell vs. without
- **Active Items**: Count of items currently in any upsell flow

Falls back to "Set up your first upsell to see stats" when no data exists.

---

## 2. Quick-Add "Push Item" Flow

The primary way merchants set up upsells. Replaces the need to understand which tab to use.

### Step 1: Select an Item

Merchant either searches or picks from suggestion tiles:

| Tile | Source | Label |
|---|---|---|
| Best Sellers | `bcg_classification = 'star'` | Items already performing well |
| Hidden Gems | `bcg_classification = 'puzzle'` | High-margin, low-popularity items worth pushing |
| Slow Movers | `bcg_classification = 'dog'` | Items that need help |
| Not in any upsell | Items with no rows in `upsell_pairs` AND not in any `bundle_items` AND `show_in_checkout_upsell = false` | Items getting zero extra push |

Tile counts are fetched on page load. BCG classification still runs under the hood — merchants just see the friendly labels.

### Step 2: System Recommends Placement

After selecting an item, the system auto-recommends the best upsell type based on:

| Item Characteristic | Auto-Recommended Placement |
|---|---|
| Has an ala-carte equivalent OR is part of a bundle with non-bundle items in same category | "Upgrade to Meal" (creates upgrade upsell pair) |
| Is a side/drink/dessert (lower price point relative to category average) | "Goes well with" (creates complementary upsell pair with mains) |
| Is a high-margin standalone item (snack, add-on, drink) | "Checkout pick" (sets `show_in_checkout_upsell = true`) |
| Is already in a bundle | Suggest adding to additional bundles |

**Recommendation logic implementation**: New function `getRecommendedPlacement(itemId)` in the menu-engineering service that analyzes item price relative to category average, existing bundle membership, and category type (if available).

### Step 3: Merchant Confirms or Customizes

- **"Add to Boost Sales"** — accepts recommendation, creates the upsell record(s) automatically
- **"Customize"** — opens the relevant tab with the item pre-selected for manual configuration

The system creates the appropriate database records:
- Upgrade → inserts into `upsell_pairs` with `pair_type = 'upgrade'`
- Goes well with → inserts into `upsell_pairs` with `pair_type = 'complementary'`, auto-selects best pairing targets using BCG logic
- Checkout pick → updates `menu_items.show_in_checkout_upsell = true`
- Bundle → navigates to Combos & Bundles tab with create flow pre-populated

---

## 3. Simplified Tab Experiences

### Tab 1: "Combos & Bundles"

Existing bundle creation/editing flow (slots, pick counts, pricing) remains unchanged — it works well.

**New addition — Post-create placement prompt**:

After creating or editing a bundle, show a prompt:

```
Where should this combo appear?
☑ Show on menu (customers browse it directly)
☑ Suggest when customer adds a matching item (smart upsell popup)
☑ Show as upgrade option on item pages (side-by-side comparison)
```

Mapping:
- Checkbox 1 → `bundles.show_on_menu`
- Checkbox 2 → `bundles.show_as_upsell`
- Checkbox 3 → Auto-creates upgrade `upsell_pairs` for items in the bundle's slots that also exist as standalone menu items

This replaces the current pattern where merchants must separately manage bundle visibility toggles and manually create upgrade pairs pointing to bundles.

### Tab 2: "Pair Suggestions"

**Reworded strategy groups**:

| Current Label | New Label | New Description |
|---|---|---|
| "Plowhorse → Star" | "Boost your margins" | "These popular items could pull in higher-profit add-ons" |
| "Star → Star" | "Maximize order value" | "Your best sellers paired together" |
| "Puzzle → Plowhorse" | "Get hidden gems noticed" | "Pair underrated items with your bestsellers to give them exposure" |

**Other changes**:
- Revenue estimates shown as plain peso amounts ("Est. +₱35 per order") not "AOV lift"
- "Generate Suggestions" button remains — relabeled to "Find new pairings"
- Accept/Reject/Bulk Accept workflow stays the same (it's solid)
- **New**: "Create your own pair" button prominently placed — opens a simple two-item picker ("Item A goes well with Item B") instead of requiring merchants to navigate to a separate upsell pairs management view
- Each pair card shows the pair type with plain language: "Goes well with" or "Upgrade to meal"

### Tab 3: "Checkout Picks"

Existing functionality (enable toggle, title/subtitle customization, max items, item picker) stays mostly the same.

**New additions**:
- **Cross-reference indicator** on each selected item: "Also in: 2 pair suggestions, 1 combo" — so merchants understand the item is being pushed through multiple channels
- **"Suggested items" section**: Auto-recommends items for checkout picks based on: not already in pairs/bundles + high margin + low price relative to average order (impulse-friendly). Merchant can accept/reject.

### Tab 4: "Performance" (New)

Dedicated analytics view for upsell effectiveness.

**Top-level metrics** (cards):
- Upsell acceptance rate (overall)
- Revenue from upsells (last 30 days)
- AOV with upsell vs. without
- Most effective upsell type

**Per-type breakdown** (bar chart or table):

| Channel | Shown | Accepted | Rate | Revenue |
|---|---|---|---|---|
| Upgrade to Meal | 234 | 65 | 27.8% | ₱6,240 |
| Pair Suggestions | 189 | 28 | 14.8% | ₱2,840 |
| Checkout Picks | 312 | 45 | 14.4% | ₱2,160 |
| Bundle Upsell | 87 | 19 | 21.8% | ₱3,420 |

**Per-item breakdown**: Which specific items/pairs are converting and which aren't. Sortable table.

**Actionable nudges** (contextual tips):
- "Your Halo-Halo pair suggestion has a 2% acceptance rate — consider replacing it"
- "Your checkout picks haven't been updated in 30 days"
- "3 menu items aren't in any upsell — [Push them →]"

**Data source**: Existing Convex analytics events (`upsell_shown`, `upsell_clicked`, `upsell_dismissed`), aggregated via new query functions. Falls back to "Add your first upsell to start tracking" empty state.

---

## 4. Customer-Side Orchestration Layer

New service: `src/lib/upsell-orchestrator.ts`

### Session Budget

**Max 2 mid-flow upsell prompts per order session.**

Checkout picks do NOT count toward the budget — they're a lightweight last-chance add at a natural pause point, not an interruption.

Session state tracked via a React context or ref in the customer app (not persisted to DB — resets on page refresh/new session).

### Priority Waterfall

When multiple upsell types could fire at a given touchpoint, the orchestrator picks the highest-priority one:

| Priority | Type | Why |
|---|---|---|
| 1 (highest) | Upgrade to Meal | Highest industry conversion (~40%). Customer is already looking at the item. |
| 2 | Bundle Upsell | High perceived value — savings badge drives action. |
| 3 | Pair Suggestion | Mid conversion — complementary, but less urgent. |
| 4 (always shown) | Checkout Picks | Last chance, lowest friction. Not counted in budget. |

### Orchestration Rules

| Rule | Behavior |
|---|---|
| Budget spent | No more mid-flow prompts. Checkout picks still show. |
| Customer dismisses a prompt | Remaining mid-flow budget is forfeited for this session. Checkout picks still show. |
| Item already in cart | Excluded from all suggestions. |
| Item already suggested this session | Excluded from subsequent suggestions. |
| No upsells configured for item | Skip silently, don't waste budget. |

### Relevance Scoring

Each potential upsell suggestion gets a score. The highest-scoring option is shown.

**Scoring factors**:

| Factor | Weight | Logic |
|---|---|---|
| Category affinity | 30% | Drinks pair with mains, desserts pair with meals. Based on category relationships (configurable per tenant in future, hardcoded heuristics initially). |
| Price ratio | 25% | Suggestions priced at 25-60% of the triggering item score highest (industry sweet spot). |
| Merchant priority | 25% | Items explicitly pushed via Quick-Add flow get a boost. Track via a `boost_priority` flag or by recency of upsell creation. |
| Historical performance | 20% | Items with higher historical `upsell_clicked / upsell_shown` ratio score higher. Pulls from Convex analytics. Falls back to equal weighting when insufficient data. |

**Cold start**: When no analytics data exists, relevance scoring uses only category affinity, price ratio, and merchant priority (first three factors, reweighted to 100%).

### Implementation Approach

The orchestrator is a **client-side coordinator**, not a server-side service:
- `UpsellOrchestratorProvider` wraps the customer app (similar to existing `AnalyticsProvider`)
- Exposes hooks: `useShouldShowUpsell(type, itemId)` returns boolean + suggested items
- Tracks session state (prompts shown, prompts dismissed, items suggested)
- Each upsell component checks with the orchestrator before rendering

Server-side functions (`getUpsellsForItem`, `getUpsellsForCart`, `getCheckoutUpsells`) remain unchanged — they still fetch all candidates. The orchestrator filters and prioritizes on the client.

---

## 5. Admin Preview — "Preview Customer Experience"

### Location

- **Page-level**: "Preview" button in the Boost Sales page header
- **Item-level**: Inline preview links on individual items, pairs, and bundles ("See what customers see")

### Behavior

Merchant selects a menu item. The preview simulates the full customer journey for that item, showing what upsell fires at each step:

```
Step 1: Product Page
  → Upsell shown: "Upgrade to Meal" (Chicken Adobo → Chicken Adobo Meal)
  → [Mini visual preview of the side-by-side cards]

Step 2: After Add to Cart
  → Upsell shown: Skipped
  → Reason: "Budget used — upgrade already shown"

Step 3: Checkout
  → Checkout picks: Halo-Halo, Leche Flan, Buko Juice
  → Note: "Chicken Adobo filtered out (already in cart)"

Summary: Customer sees 2 upsell moments.
Estimated AOV lift: +₱55-85 per order
```

### Edge Cases

- **No upsells configured**: "No upsell moments for this item. [Push this item →]"
- **Only checkout picks**: "This item has no upgrade or pair suggestions — only checkout picks. Consider adding a pairing."
- **Multiple possible upsells**: Shows which one the orchestrator would pick and why others are suppressed

### Implementation

The preview runs the orchestrator logic in "simulation mode" — same scoring and budget rules, but rendered as a step-by-step visualization instead of actual modals. This is a read-only admin component, not a full customer app simulation.

---

## 6. Language Remapping (BCG → Merchant-Friendly)

All merchant-facing UI uses plain language. BCG engine continues to run under the hood.

| Internal (BCG) | Merchant-Facing Label | Context |
|---|---|---|
| `star` | "Best Seller" | Quick-add tiles, item badges |
| `plowhorse` | "Popular" | Quick-add tiles, item badges |
| `puzzle` | "Hidden Gem" | Quick-add tiles, item badges |
| `dog` | "Slow Mover" | Quick-add tiles, item badges |
| `unclassified` | "New" or no label | Items not yet classified |
| "BCG Classification" | "Item Performance" | Admin labels |
| "Complementary pair" | "Goes well with" | Pair suggestion cards |
| "Upgrade pair" | "Upgrade to meal" | Upgrade cards |
| "AOV Lift" | "Extra revenue per order" | Analytics |
| "Plowhorse → Star" strategy | "Boost your margins" | Pair suggestions tab |
| "Star → Star" strategy | "Maximize order value" | Pair suggestions tab |
| "Puzzle → Plowhorse" strategy | "Get hidden gems noticed" | Pair suggestions tab |

The existing `bcg_classification` column and all service-layer functions remain unchanged. The remapping happens only at the UI/component layer.

---

## 7. Data Model Changes

### New Fields

**`menu_items` table**:
- `boost_priority: integer DEFAULT 0` — Set when merchant uses Quick-Add flow. Higher = more likely to appear in suggestions. Used by relevance scoring.

**`tenants` table**:
- No new columns needed. Existing `menu_engineering_enabled`, `checkout_upsell_enabled`, and `bundles_enabled` flags are sufficient.

### New Queries (Convex)

- `getUpsellPerformanceSummary(tenantId, dateRange)` — Aggregates upsell analytics for Performance tab
- `getPerItemUpsellStats(tenantId, dateRange)` — Per-item breakdown
- `getPerTypeUpsellStats(tenantId, dateRange)` — Per-channel breakdown

### New Service Functions

**`src/lib/upsell-orchestrator.ts`** (client-side):
- `UpsellOrchestratorProvider` — React context provider
- `useShouldShowUpsell(type, itemId)` — Hook for components to check orchestrator
- `useUpsellSession()` — Session state (budget remaining, items shown, dismissed)

**`src/lib/menu-engineering-service.ts`** (additions):
- `getRecommendedPlacement(itemId)` — Analyzes item and recommends upsell type
- `getItemsNotInAnyUpsell(tenantId)` — Items with no upsell coverage
- `getUpsellCoverageForItem(itemId)` — Returns which upsell types an item appears in

---

## 8. Feature Gating

All new features are gated behind the existing `menu_engineering_enabled` tenant flag. No new feature flags needed.

The Performance tab and Quick Stats bar degrade gracefully when no analytics data exists (empty states with setup prompts).

---

## 9. Migration Strategy

This is an **additive redesign**, not a rewrite:

1. Existing service functions (`bundles-service.ts`, `menu-engineering-service.ts`) remain unchanged
2. Existing customer-facing components remain unchanged (orchestrator wraps them, doesn't replace them)
3. Existing database schema is preserved (one new column: `boost_priority`)
4. New admin page (`boost-sales/`) is built alongside existing `menu-engineering/` page
5. Old route redirects to new page once verified
6. BCG engine continues running — only the UI labels change

No data migration needed. No breaking changes to existing functionality.

---

## 10. Out of Scope (Future Phases)

- **Auto-Pilot mode** (AI auto-generates and rotates pairs based on conversion data)
- **Time-based rules** (daypart-specific upsells, e.g., breakfast combos in morning)
- **Customer segmentation** (different upsells for first-time vs. repeat customers)
- **Post-purchase upsell** (next-order incentive after payment)
- **A/B testing infrastructure** (test different copy/layouts/pairings)
- **Mobile app upsell optimization** (Expo apps have separate UX considerations)
- **Category affinity configuration** (admin-configurable pairing rules beyond heuristics)
