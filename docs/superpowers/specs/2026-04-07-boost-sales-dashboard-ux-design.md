# Boost Sales Dashboard UX Improvement

**Date:** 2026-04-07
**Scope:** Dashboard hero section + tab renaming. No changes to tab internals, BCG matrix, bundles, or customer-facing components.

## Problem

Merchants land on the Boost Sales dashboard and don't understand:
- What the tabs do or how they relate to each other
- That the features work together as a sales funnel across the customer journey
- The naming doesn't communicate value ("Upgrade Pairs", "Pairing Rules", "Checkout Picks")

## Solution: Visual Funnel Hero + Renamed Tabs

### 1. Hero Funnel Section

A horizontal 3-step funnel at the top of the dashboard, above the tabs.

**Headline:** "Your customers see upsells at 3 key moments"
**Subtitle:** "Set up each touchpoint to increase your average order value."

Three cards in a row connected by arrow/chevron separators:

| Step | Icon | Title | Subtitle | Count Example |
|------|------|-------|----------|---------------|
| 1 | `Eye` | Product Page | Suggest an upgrade before they order | "2 active pairs" |
| 2 | `ShoppingBag` | After Add to Cart | Recommend items that go well together | "3 active rules" |
| 3 | `CreditCard` | Checkout | Last chance to add more items | "5 items selected" |

Visual treatment: soft background cards, icon + title + subtitle + count badge. Not clickable. Connected by chevron arrows.

### 2. Tab Renaming

| Current | New Name | Subtitle (shown on active tab) |
|---------|----------|-------------------------------|
| Combos & Bundles | Combos & Bundles | *(unchanged)* |
| Upgrade Pairs | Upgrade Prompts | "Suggest a bigger option" |
| Pairing Rules | Pair Suggestions | "Recommend items that go together" |
| Checkout Picks | Checkout Offers | "Last-chance items before payment" |

Subtitles appear as small muted text under the active tab label only.

### 3. Page Copy

- Title: "Boost Sales" (unchanged)
- Subtitle: "Set up upsell moments across your customer's ordering journey" (was: "Push your best items, create combos, and track what's working")

### Files to Modify

- `src/components/admin/boost-sales-dashboard.tsx` — hero section, tab labels, subtitle
- No new files needed
