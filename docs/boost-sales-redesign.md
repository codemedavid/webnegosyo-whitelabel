# Boost Sales Dashboard - Redesign Reference

> Complete inventory of every section, data field, component, and interaction on the current Boost Sales page.
> Use this as the source of truth when designing the new UI.

---

## Page Entry Point

| Field | Value |
|-------|-------|
| Route | `/{tenant}/admin/boost-sales` |
| Gate | `tenant.menu_engineering_enabled` (redirects to admin dashboard if off) |
| Server data fetched | Menu items (with BCG + category), categories, upsell pairs (with items), bundles (with slots) |
| Breadcrumb | Dashboard > Boost Sales |
| Page title | "Boost Sales" |
| Subtitle | "Push your best items, create combos, and track what's working" |

---

## Page Layout (top to bottom)

```
1. Stats Bar            (4 metric cards)
2. Push Item Flow       (search + BCG tiles + recommendation engine)
3. Preview Button       ("Preview Customer Experience" toggle)
4. Preview Panel        (conditional - customer journey simulator)
5. Tab Navigation       (6 tabs)
   a. Combos & Bundles
   b. Upgrade Pairs
   c. Pair Suggestions
   d. Pairing Rules     (conditional - if pairing_rules_enabled)
   e. Checkout Picks
   f. Performance
```

---

## 1. Stats Bar

Four summary cards displayed in a `2x2` (mobile) / `4x1` (desktop) grid.

| Card | Value | Detail Line | Icon | Data Source |
|------|-------|-------------|------|-------------|
| **Active Upsells** | `totalActive` (number) | "{activePairs} pairs, {activeBundles} combos, {checkoutPicks} checkout" | Zap | Computed: active upsell pairs + active bundles + items with `show_in_checkout_upsell` |
| **Menu Coverage** | `{coveragePercent}%` | "of items are in at least one upsell" | Target | Computed: unique items appearing in any active pair or checkout pick / total menu items |
| **Acceptance Rate** | `--` (placeholder) | "Connect analytics to see live data" | TrendingUp | Requires Convex analytics |
| **Extra Revenue** | `--` (placeholder) | "Connect analytics to see live data" | DollarSign | Requires Convex analytics |

---

## 2. Push Item Flow

An interactive card that helps merchants push underperforming items into upsell placements.

### Default State

| Element | Description |
|---------|-------------|
| Prompt | "What do you want to sell more of?" |
| Search input | Searches menu items by name or category, shows dropdown (max 8 results) with item name + price |

**BCG Quick-Pick Tiles** (2x2 mobile / 4x1 desktop):

| Tile | Icon | Color | Count Source | Behavior |
|------|------|-------|-------------|----------|
| Best Sellers | Star | amber-600 | Items where `bcg_classification = 'star'` | Selects first star item |
| Hidden Gems | Gem | purple-600 | Items where `bcg_classification = 'puzzle'` | Selects first puzzle item |
| Slow Movers | TrendingDown | red-600 | Items where `bcg_classification = 'dog'` | Selects first dog item |
| Not in any upsell | AlertCircle | gray-600 | Items not in any pair or checkout pick | Selects first uncovered item |

### After Item Selected

| Element | Description |
|---------|-------------|
| Selected item display | Item name + formatted price |
| "Change item" button | Resets back to search state |
| Loading state | "Analyzing item..." with spinner |
| Recommendation card | Highlighted card showing the recommended placement |

**Placement Recommendations** (from `getRecommendedPlacementAction`):

| Placement | Label | Description |
|-----------|-------|-------------|
| `upgrade` | "Upgrade to Meal" | Show when someone orders a lower-priced version |
| `complementary` | "Goes well with" | Suggest alongside mains and combos |
| `checkout_pick` | "Checkout pick" | Show before payment as an impulse add |
| `bundle` | "Add to a combo" | Include in more bundle deals |

**Actions**: "Add to Boost Sales" (sets boost_priority=10) | "Cancel"

---

## 3. Preview Customer Experience

A toggleable simulation panel. Merchant selects a menu item and sees a step-by-step walkthrough of what the customer would experience.

### Journey Steps Simulated

| Step | Label | What It Checks | Status Badges |
|------|-------|----------------|---------------|
| 1 | Product Page | Active upgrade pairs for item OR active bundles matching item's category | Active (green) / None (empty circle) |
| 2 | After Add to Cart | Active complementary pairs for item (skipped if budget of 2 prompts already used) | Active (green) / Skipped (amber) / None |
| 3 | Checkout | Items marked `show_in_checkout_upsell` (excluding selected item) | Active (green) / None |

**Budget System**: Max 2 upsell moments before checkout. Step 3 (checkout picks) always shows regardless of budget.

**Summary Line**: "Customer sees {N} upsell moment(s)." + warning if zero moments.

---

## 4. Tab: Combos & Bundles

Component: `BundlesList`

### Data Fields per Bundle

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Bundle display name |
| `description` | string | Optional description |
| `image_url` | string | Bundle image (Cloudinary) |
| `pricing_type` | `'fixed'` or `'discount'` | How the bundle is priced |
| `fixed_price` | number | Used when pricing_type = 'fixed' |
| `discount_percent` | number | Used when pricing_type = 'discount' |
| `is_active` | boolean | Active/inactive toggle |
| `show_on_menu` | boolean | Appears in menu's Bundles Section |
| `show_as_upsell` | boolean | Triggers BundleUpsellModal when adding a slot item |
| `display_order` | number | Sort position |

### Bundle Slots (per bundle)

| Field | Type | Description |
|-------|------|-------------|
| `category_id` | string | Target category for this slot |
| `pick_count` | number | How many items customer picks from this slot |
| `included_item_ids` | string[] | Optional whitelist (empty = all items in category) |
| `sort_order` | number | Slot ordering within bundle |

### Slot Price Overrides (per slot)

| Field | Type | Description |
|-------|------|-------------|
| `menu_item_id` | string | Specific item |
| `price_override` | number | Custom price when selected in this slot |

### Actions

- Create bundle (name, description, image, pricing, slots)
- Edit bundle
- Delete bundle
- Toggle active/inactive
- Toggle show_on_menu / show_as_upsell
- Reorder bundles (drag or manual)

---

## 5. Tab: Upgrade Pairs

Component: `UpsellPairsTab`

Manages "Upgrade to Meal" style pairs (source item -> target item).

### Data Fields per Upgrade Pair

| Field | Type | Description |
|-------|------|-------------|
| `source_item_id` | string | The "basic" item |
| `target_item_id` | string | The "upgrade" item |
| `pair_type` | `'upgrade'` | Always upgrade for this tab |
| `upgrade_header` | string | Custom header (default: "Make it a Meal?") |
| `source_label` | string | Label for source (default: "Ala Carte") |
| `target_label` | string | Label for target (default: "Meal") |
| `display_order` | number | Sort position |
| `is_active` | boolean | Toggle |
| `is_auto_generated` | boolean | Whether AI-generated |
| `bcg_strategy` | string | BCG strategy that generated it |

### UI Elements

- **Create form**: Source item dropdown + Target item dropdown + custom labels
- **Live preview**: Side-by-side card comparison with price difference badge
- **Pair list**: Searchable/filterable list of existing pairs
- **Smart Upgrade Panel**: AI-suggested bundles + category-based upgrades

### Actions

- Create upgrade pair
- Delete upgrade pair
- Search/filter pairs
- Get smart upgrade suggestions (via `getSmartUpgradeSuggestionsAction`)

---

## 6. Tab: Pair Suggestions

Component: `SmartPairSuggestionsTab`

AI-generated "Perfect with..." complementary pair suggestions based on BCG classification.

### Suggestion Strategies

| Strategy | Label | Logic |
|----------|-------|-------|
| `plowhorse_to_star` | "Popular low-margin -> high-margin" | Pair popular cheap items with profitable ones |
| `star_to_star` | "Maximize AOV among bestsellers" | Cross-sell between top performers |
| `puzzle_to_plowhorse` | "Drive discovery of niche high-margin items" | Use popular items to surface hidden gems |

### Data Fields per Suggestion

| Field | Description |
|-------|-------------|
| Source item | Name, image, price, BCG classification |
| Target item | Name, image, price, BCG classification |
| Strategy | Which BCG strategy generated this pair |
| AOV lift estimate | Potential increase in average order value |

### Actions

- **Generate suggestions** (runs BCG algorithm)
- **Accept individual** suggestion (creates a complementary upsell pair)
- **Reject individual** suggestion
- **Bulk accept** all suggestions in a strategy group

---

## 7. Tab: Pairing Rules

Component: `PairingRulesTab` (conditional: `pairing_rules_enabled`)

Rule-based auto-pairing system for scalable pair suggestions.

### Rule Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Rule name |
| `source_type` | `'category'` or `'tag'` | What triggers the rule |
| `source_category_id` | string | Source category (if type = category) |
| `source_tag_id` | string | Source tag (if type = tag) |
| `max_suggestions` | number (1-8) | Max items to suggest per trigger |
| `is_active` | boolean | Toggle |

### Rule Targets (1-3 per rule)

| Field | Type | Description |
|-------|------|-------------|
| `target_type` | `'category'` or `'tag'` | Target type |
| `target_category_id` | string | Target category |
| `target_tag_id` | string | Target tag |
| `selection_mode` | `'any'` or `'handpick'` | "Any from Category" or manually picked items |
| `display_order` | number | Target priority |

### Handpicked Items (per target, if selection_mode = 'handpick')

| Field | Description |
|-------|-------------|
| `menu_item_id` | Specific item to suggest |
| `display_order` | Order within this target |

### UI Sections

- **Platform defaults** (read-only reference toggles)
- **Tenant rules list** with active/inactive toggles
- **Rule builder** form with source picker, target picker(s), selection mode
- **Item picker modal** (`RuleItemPicker`) for handpick mode

### Actions

- Create rule (with nested targets + items)
- Edit rule (replaces all targets)
- Delete rule
- Toggle rule active/inactive

---

## 8. Tab: Checkout Picks

Component: `CheckoutUpsellSettingsTab`

Configures the "Before you go..." interstitial shown at checkout.

### Settings Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `checkout_upsell_enabled` | boolean | false | Master toggle |
| `checkout_upsell_title` | string | "Before you go..." | Header text |
| `checkout_upsell_subtitle` | string | "You might also enjoy these items" | Subtitle text |
| `checkout_upsell_max_items` | number | 4 (range: 1-8) | Max items shown |

### Item Selection

- Checkbox list of all menu items
- Items with `show_in_checkout_upsell = true` are checked
- Debounced save on toggle

### Coverage Indicators

| Metric | Description |
|--------|-------------|
| Pair count | How many complementary pairs feed into checkout |
| Bundle count | How many active bundles contribute |

### Checkout Priority Waterfall (how items are selected at runtime)

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | Manual picks | Items where `show_in_checkout_upsell = true` |
| 2 | Complementary pairs | Items paired with current cart contents |
| 3 | BCG stars | Star-classified items (Redis-cached) |

### Actions

- Toggle checkout upsell enabled/disabled
- Edit title and subtitle
- Change max items slider
- Toggle individual items on/off for checkout

---

## 9. Tab: Performance

Component: `BoostSalesPerformanceTab`

### Pre-requisite

Requires `convex_deployment_url` to be set. Shows "Analytics Not Connected" empty state otherwise.

### Top-Level Metrics (4 cards)

| Metric | Detail Line | Data Source |
|--------|-------------|-------------|
| Acceptance Rate | "Across all channels" | Convex analytics |
| Revenue from Upsells | "Last 30 days" | Convex analytics |
| Extra per Order | "Avg from upsold items" | Convex analytics |
| Best Channel | "Highest acceptance rate" | Convex analytics |

### Per-Channel Breakdown Table

| Column | Description |
|--------|-------------|
| Channel | Upsell type name |
| Shown | Times this upsell was displayed |
| Accepted | Times customer accepted |
| Rate | Acceptance percentage |
| Revenue | Revenue generated |

**Channels tracked:**

| Channel | Maps to |
|---------|---------|
| Upgrade to Meal | Upgrade pairs (product page) |
| Pair Suggestions | Complementary pairs (after add to cart) |
| Checkout Picks | Checkout interstitial items |
| Bundle Upsell | Bundle suggestion modal |

### Tips Section

- Dynamic improvement suggestions (placeholder - populates once enough data exists)

---

## Feature Flags Summary

| Flag | Scope | What It Gates |
|------|-------|---------------|
| `menu_engineering_enabled` | Entire page | Access to Boost Sales dashboard |
| `bundles_enabled` | Bundles tab | Bundle creation and management |
| `pairing_rules_enabled` | Rules tab | Pairing Rules tab visibility |
| `checkout_upsell_enabled` | Checkout | Customer-facing checkout interstitial |

---

## Database Tables Involved

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `tenants` | Feature flags + checkout settings | `menu_engineering_enabled`, `bundles_enabled`, `pairing_rules_enabled`, `checkout_upsell_enabled`, `checkout_upsell_title`, `checkout_upsell_subtitle`, `checkout_upsell_max_items` |
| `menu_items` | Items with BCG data | `bcg_classification`, `badge_text`, `show_in_checkout_upsell`, `boost_priority`, `price`, `discounted_price`, `category_id` |
| `categories` | Menu categories | `id`, `name`, `tenant_id` |
| `upsell_pairs` | Manual + auto pairs | `source_item_id`, `target_item_id`, `pair_type`, `upgrade_header`, `source_label`, `target_label`, `is_active`, `is_auto_generated`, `bcg_strategy`, `display_order` |
| `bundles` | Bundle definitions | `name`, `description`, `image_url`, `pricing_type`, `fixed_price`, `discount_percent`, `is_active`, `show_on_menu`, `show_as_upsell`, `display_order` |
| `bundle_slots` | Slots within bundles | `bundle_id`, `category_id`, `pick_count`, `included_item_ids`, `sort_order` |
| `bundle_slot_price_overrides` | Per-item pricing in slots | `slot_id`, `menu_item_id`, `price_override` |
| `pairing_rules` | Rule definitions | `name`, `source_type`, `source_category_id`, `source_tag_id`, `max_suggestions`, `is_active` |
| `pairing_rule_targets` | Rule targets (1-3 per rule) | `rule_id`, `target_type`, `target_category_id`, `target_tag_id`, `selection_mode`, `display_order` |
| `pairing_rule_target_items` | Handpicked items | `target_id`, `menu_item_id`, `display_order` |
| `tag_definitions` | Tags for rule matching | `group_name`, `tag_value`, `is_preset`, `tenant_id` |
| `menu_item_tags` | Item-to-tag mapping | `menu_item_id`, `tag_definition_id` |

---

## Component Reference

| Component | File | Role |
|-----------|------|------|
| `BoostSalesDashboard` | `boost-sales-dashboard.tsx` | Main shell: stats bar, push flow, preview, tabs |
| `BoostSalesStatsBar` | `boost-sales-stats-bar.tsx` | 4 summary metric cards |
| `PushItemFlow` | `push-item-flow.tsx` | Search + BCG tiles + placement recommendation engine |
| `UpsellPreviewPanel` | `upsell-preview-panel.tsx` | Customer journey simulator (3-step walkthrough) |
| `BundlesList` | `bundles-list.tsx` | Bundle CRUD with slot management |
| `UpsellPairsTab` | `upsell-pairs-tab.tsx` | Upgrade pair creation with live preview + smart suggestions |
| `SmartPairSuggestionsTab` | `smart-pair-suggestions-tab.tsx` | AI-generated complementary pair suggestions with accept/reject |
| `PairingRulesTab` | `pairing-rules-tab.tsx` | Rule builder with source/target pickers and item selection |
| `RuleItemPicker` | `rule-item-picker.tsx` | Modal for handpicking items within rule targets |
| `CheckoutUpsellSettingsTab` | `checkout-upsell-settings-tab.tsx` | Checkout interstitial config (toggle, text, max items, item picker) |
| `BoostSalesPerformanceTab` | `boost-sales-performance-tab.tsx` | Analytics dashboard (metrics + channel breakdown + tips) |
| `SmartUpgradePanel` | `smart-upgrade-panel.tsx` | AI suggestions for upgrade pairs (within Upgrade Pairs tab) |

---

## Customer-Facing Touchpoints (for context)

These are the customer-side components that the Boost Sales config drives:

| Touchpoint | Component | Trigger |
|------------|-----------|---------|
| "Make it a Meal?" section | `inline-upgrade-section.tsx` | Product detail page, if upgrade pair exists |
| "Perfect with..." sheet | `pair-suggestion-sheet.tsx` | After add-to-cart, if complementary pair exists |
| "Before you go..." page | `checkout-upsell-modal.tsx` | Checkout button press |
| Bundle section on menu | `bundles-section.tsx` | Menu page, if bundles with `show_on_menu` exist |
| Bundle upsell modal | `bundle-upsell-modal.tsx` | Adding item that belongs to a bundle with `show_as_upsell` |
| Bundle customization | `bundle-customization-modal.tsx` | Selecting a bundle (per-slot item picking) |

---

## Analytics Events Tracked

| Event | Source | Payload |
|-------|--------|---------|
| `upsell_shown` | All touchpoints | `source`, `item_id`, `suggested_items` |
| `upsell_clicked` | Customer accepts suggestion | `source`, `item_id`, `accepted_item_id` |
| `upsell_dismissed` | Customer dismisses | `source`, `item_id` |

**Source values**: `inline_upgrade`, `pair_suggestion`, `checkout_modal`, `bundle_upsell`
