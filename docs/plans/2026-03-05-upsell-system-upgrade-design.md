# Upsell System Massive Upgrade — Design Document

**Date:** 2026-03-05
**Goal:** Maximize AOV through a 3-phase upsell funnel with smart admin tooling

## Overview

Rebuild the upsell system into a 3-phase funnel inspired by McDonald's kiosk UX:
1. **Upgrade Upsell** — Inline on product detail page (McD "Make it a Meal")
2. **Pair Suggestions** — Slide-up sheet on Add to Cart
3. **Checkout Interstitial** — Improved desktop UI for last-chance upsells

## Phase 1: Upgrade Upsell (McDonald's Kiosk Style)

### Customer Experience
- On the product detail page, below item customization (variations/addons), an **"Upgrade Your Order"** section appears inline
- Shows 1-3 upgrade options as cards: bundles containing this item, or higher-priced items from same category
- Each card: thumbnail, name, price difference ("+P30"), savings badge if bundle
- One-tap to switch — replaces current item selection with the upgrade
- Design: clean cards with green accent for savings, McD kiosk "Make it a Meal" feel

### Admin Experience
- In menu engineering dashboard, when editing an item, new **"Upgrade Suggestions"** panel
- System auto-suggests: (1) bundles containing this item, (2) higher-priced items in same category
- Suggestions ranked by potential AOV lift with "Use as Upgrade" toggle
- Admin can manually search and add custom upgrade targets
- Custom labels per upgrade (e.g., "Make it a Combo", "Go Large")

### Data Changes
- Reuse `upsell_pairs` table with `pair_type = 'upgrade'`
- Add `upgrade_display_style` column (`inline` | `modal`) for flexibility
- New service: `getSmartUpgradeSuggestions(itemId, tenantId)` — queries bundles + same-category items

## Phase 2: Pair Suggestions (Post-Customize, Pre-Leave)

### Customer Experience
- After customizing and tapping **"Add to Cart"**, slide-up sheet appears
- "Goes great with..." header + 1-3 paired items as horizontal cards
- Each card: thumbnail, name, price, quick "Add" button
- For plowhorses: prioritize pairing with higher-margin items
- Quick dismiss: swipe down or "No thanks" — item still added to cart regardless
- If customer adds a pair, both go to cart and sheet dismisses
- Replaces current `UpsellSuggestionModal`

### Admin Experience
- New **"Pair Suggestions"** tab in menu engineering dashboard
- **Auto-generated pairs** based on BCG classification:
  - Plowhorses → paired with stars/puzzles (boost margin)
  - Stars → paired with other stars (maximize AOV)
  - Puzzles → paired with plowhorses (drive discovery)
  - Dogs → no auto-pairs (flagged for review)
- Admin sees suggestions with "Accept" / "Reject" buttons
- Manual add/override per item (search + select up to 3)
- Bulk actions: "Accept all suggestions for this category"

### Data Changes
- Reuse `upsell_pairs` with `pair_type = 'complementary'`
- Add `is_auto_generated: boolean` column
- Add `bcg_strategy: text` column (records why pair was suggested)
- New service: `generateSmartPairSuggestions(tenantId)` — BCG-based pairing algorithm

## Phase 3: Checkout Interstitial (UI Polish)

### Customer Experience (Desktop)
- Full-width bottom drawer on desktop (premium feel)
- Larger product images, horizontal scrollable layout
- "Last chance" urgency messaging with subtle animation
- Running total: "Your cart: P450 → P520 with these additions"
- Better breakpoints: 2 items mobile, 3 tablet, 4 desktop
- Smooth add animation with real-time cart total update

### Admin Improvements
- Live preview of checkout modal with real products
- Drag-to-reorder priority items
- Analytics dashboard showing conversion rates per tier

### Existing waterfall kept (Tier 1-4 priority system unchanged)

## Team Structure

### Agent 1: Team Lead (Orchestrator)
- Shared data layer (migrations, types, service functions)
- Cross-cutting concerns (analytics, feature flags)
- Merge conflict resolution, consistency review

### Agent 2: Customer UX
- Phase 1: Inline upgrade section on product detail page
- Phase 2: Slide-up pair suggestion sheet
- Phase 3: Desktop checkout interstitial UI polish
- Focus: Speed, animations, responsive, mobile-first

### Agent 3: Admin Experience
- Smart upgrade suggestion panel
- Auto-generate pair suggestions UI (accept/reject/override)
- Improved checkout interstitial settings with live preview
- Focus: Ease of use, bulk actions, clear UX

### Agent 4: Business Logic
- `getSmartUpgradeSuggestions()` — bundles + same-category ranking
- `generateSmartPairSuggestions()` — BCG-based pairing algorithm
- Checkout waterfall optimization
- Analytics tracking for all 3 phases
- Performance optimization, bug fixes

## Feature Flags
- Reuse existing `menu_engineering_enabled` as master gate
- Reuse existing `checkout_upsell_enabled` for checkout interstitial
- Upgrade and pair upsells gated by `menu_engineering_enabled`

## Analytics
- Track all 3 phases: `upsell_shown`, `upsell_clicked`, `upsell_converted`
- Source tagging: `upgrade`, `pair`, `checkout_interstitial`
- Full funnel attribution in cart items via `upsellSource` field
