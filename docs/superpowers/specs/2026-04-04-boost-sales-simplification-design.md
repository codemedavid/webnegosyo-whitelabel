# Boost Sales Dashboard Simplification

**Date:** 2026-04-04
**Branch:** feat/rule-based-pairing
**Approach:** Surgical Deletion (Approach A)

## Problem

The Boost Sales dashboard has 3 persistent sections + 6 tabs + 1 bottom section (~10 visual zones, ~5,400 lines across 12 components). Key issues:

1. **Triple-redundant analytics** — Stats Bar, Performance Tab, and Performance Snapshot all show placeholder dashes
2. **Four overlapping pairing methods** — Upgrade Pairs, Smart Pair Suggestions, Pairing Rules, Complementary Pairs
3. **Six search bars** — each tab/section has its own search with slightly different behavior
4. **Push Item Flow always visible** — 258-line diagnostic tool with BCG tiles + recommendation engine permanently above tabs
5. **Stats Bar overloaded** — Active Upsells + Upsell Health badge + Menu Coverage + analytics callout in one row, with health shown three ways (label, percentage, progress bar)
6. **Pairing Rules complexity exposed as primary tab** — 673 lines, 14 useState hooks, nested modals

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Complementary Pairs Tab | Delete (dead code) | Not wired into dashboard |
| Smart Pair Suggestions Tab | Delete | Deemed not useful currently |
| Performance Tab | Delete | All placeholder data, no real analytics piped in |
| Performance Snapshot (bottom) | Delete | Duplicates Performance Tab |
| Stats Bar | Delete entirely | Tab badges already carry counts |
| Push Item Flow | Rewrite as dialog | Only useful during setup, not daily use |
| Pairings consolidation | Keep Upgrade Pairs + Pairing Rules as separate tabs | Feature flag controls Rules visibility |
| Preview CX button | Move to page header | Was in stats bar, needs a new home |

## Resulting Structure

```
Page Header:  [Boost Sales title + subtitle]  [Find Uncovered Items]  [Preview CX]

Tabs:  Combos & Bundles | Upgrade Pairs | Pairing Rules* | Checkout Picks
                                           (* conditional on pairing_rules_enabled)
```

**Before:** 3 persistent sections + 6 tabs + bottom section = ~10 visual zones
**After:** 1 header row + 3-4 tabs = ~4-5 visual zones

## File Changes

### Files to Delete

| File | Lines | Reason |
|------|-------|--------|
| `src/components/admin/boost-sales-stats-bar.tsx` | 142 | Stats bar removed |
| `src/components/admin/boost-sales-performance-tab.tsx` | 116 | Placeholder-only analytics |
| `src/components/admin/smart-pair-suggestions-tab.tsx` | 417 | Not useful currently |
| `src/components/admin/complementary-pairs-tab.tsx` | 688 | Dead code |

### Files to Modify

**`src/components/admin/boost-sales-dashboard.tsx`** (463 → ~200 lines):
- Remove imports: `BoostSalesStatsBar`, `PushItemFlow`, `SmartPairSuggestionsTab`, `BoostSalesPerformanceTab`
- Remove state: `searchQuery`, `selectedCategory`
- Remove memos: `itemsNotInUpsellIds`, `categoryCounts`
- Remove inline components: `PerformanceSnapshot`, `MetricCard`, `SetupProgressCard`
- Remove from tabs array: `pairs` (Smart), `performance`
- Remove rendered sections: stats bar, search + category pills + coverage alert, Push Item Flow, Performance Snapshot
- Keep: `tabStats` memo (feeds tab badges), tab definitions for bundles/upgrades/rules/checkout, `UpsellPreviewPanel` lazy import
- Add: `showUncovered` state (for uncovered items dialog)

**`src/app/[tenant]/admin/boost-sales/page.tsx`**:
- Remove `convexDeploymentUrl` prop pass (no longer needed by dashboard)
- No button changes here — `page.tsx` is a server component; buttons live in the client dashboard

**Dashboard header row** (new section at top of dashboard render):
- Preview CX button + Find Uncovered Items button render as a row above the tabs
- `showPreview` state stays in dashboard (controls `UpsellPreviewPanel`)
- New `showUncovered` state controls the uncovered items dialog

**`src/components/admin/push-item-flow.tsx`** (258 → ~80 lines):
- Strip: recommendation engine (`getRecommendedPlacementAction`, `setBoostPriorityAction`), BCG metric tiles, placement labels, recommendation UI
- Keep: search input + list of menu items with no upsell coverage
- Wrap in `Dialog` from shadcn/ui
- Triggered by button in dashboard header area

### Files Untouched

- `upsell-pairs-tab.tsx` (506 lines)
- `pairing-rules-tab.tsx` (673 lines)
- `checkout-upsell-settings-tab.tsx` (399 lines)
- `bundles-list.tsx` (225 lines)
- `upsell-preview-panel.tsx` (240 lines)

## Props Changes

**`BoostSalesDashboardProps` removals:**
- `convexDeploymentUrl` — only used by stats bar + performance tab

**`BoostSalesDashboardProps` kept as-is:**
- `menuItems`, `categories`, `upsellPairs`, `bundles` — used by remaining tabs
- `tenantId`, `tenantSlug` — passed to tabs
- `checkoutUpsellEnabled`, `checkoutUpsellTitle`, `checkoutUpsellSubtitle`, `checkoutUpsellMaxItems` — checkout tab
- `bundlesEnabled` — bundles tab
- `pairingRulesEnabled`, `initialPairingRules`, `initialTagDefinitions` — pairing rules tab

## Net Impact

- ~1,800 lines deleted
- ~50 lines added
- 4 files removed
- 3 files modified
