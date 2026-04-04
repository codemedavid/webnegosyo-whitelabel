# Unified Full-Screen Upsell System

**Date:** 2026-03-28
**Scope:** Customer-side upsell experience only (admin side out of scope)

## Problem

The customer upsell experience has 3 separate modal components with inconsistent designs:
- `PairSuggestionSheet` (bottom sheet)
- `BundleUpsellModal` (centered modal)
- `UpsellSuggestionModal` (bottom sheet)

These cause several issues:
1. **Pair suggestions always win over bundle upsells** - if an item has both, the bundle modal never shows because pair suggestions are checked first in the priority chain
2. **Inconsistent modal behaviors** - bottom sheets, centered modals, and full-screens mixed together
3. **buyNowIntent gets lost** - ref-based intent clears mid-flow when multiple modals interact
4. **No escape key handling** on pair suggestion sheet
5. **Inconsistent navigation timing** - some modals use `setTimeout(250ms)`, others navigate instantly
6. **Inconsistent image preloading** - different strategies per component

## Solution

Replace all 3 post-add-to-cart modals with a single `PostAddUpsellScreen` full-screen component that adapts its layout based on available upsell data. Refactor `CheckoutUpsellModal` to use the same full-screen design language.

---

## Design

### 1. PostAddUpsellScreen (New Component)

Replaces: `PairSuggestionSheet`, `BundleUpsellModal`, `UpsellSuggestionModal`

**Trigger:** After `addItem()` in `product-detail-content.tsx`, when any upsell data exists (complementary pairs, bundle match, or both).

#### Mode A - Pairs Only (no matching bundle)

Adaptive layout where items expand to fill the screen.

- Header: "Perfect with [Item Name]" / "Complete your meal"
- Responsive grid: 2 cols mobile, 3 tablet, 4 desktop
- Large cards with 4:3 images
- Green checkmark overlay on added items
- Primary CTA: "Continue" button

#### Mode B - Pairs + Bundle

Split layout accommodating both upsell types.

- Header: "Perfect with [Item Name]" / "Complete your meal"
- Pairs grid (2 rows max) at top
- Divider: "or make it a bundle"
- Bundle card below with name, savings badge, slot count, "Upgrade to Bundle" CTA
- Clicking "Upgrade to Bundle" opens existing BundleWizard
- Primary CTA: "Continue" button

#### Mode C - Bundle Only (no pair suggestions, but bundle matches)

Hero-sized bundle card centered on screen.

- Header: "Bundle Deal Available!" / "Save more with a combo"
- Large bundle card with image, name, description, slot pills, savings amount
- Primary CTA: "Upgrade to Bundle" button
- Secondary: "No thanks, continue" ghost link

#### Shared Behaviors (All Modes)

- Full-screen overlay: `fixed inset-0 z-50`, white background
- Framer Motion slide-up entrance, fade-out exit
- Escape key closes (same as clicking Continue)
- Body scroll lock via `useBodyScrollLock()` hook
- Image preloading for first 6 items via `useImagePreload()` hook
- Analytics: `upsell_shown`, `upsell_clicked`, `upsell_dismissed` with combined metadata including mode info

### 2. Checkout Upsell Full-Screen (Refactor)

Refactor existing `CheckoutUpsellModal` to use the same full-screen design language.

**Trigger:** Same as today - when customer clicks "Proceed to Checkout" from cart page, if checkout upsell is enabled and suggestions exist.

**Layout:**
- Header: Admin-customizable title/subtitle (existing `checkout_upsell_title`, `checkout_upsell_subtitle` fields)
- Responsive item grid: 2 cols mobile, 3 tablet, 4 desktop (same card component as PostAddUpsellScreen)
- Running cart total that updates as items are added
- Primary CTA: "Continue to Checkout"
- Secondary: "No thanks, checkout" ghost link

**Key differences from PostAddUpsellScreen:**
- Title/subtitle are admin-customizable
- Shows running cart total
- Data source is cart-based (`getCheckoutUpsellsAction`) not item-based
- No bundle section - purely complementary items for the whole cart

**Shared with PostAddUpsellScreen:**
- Same `UpsellFullScreenLayout` wrapper
- Same `UpsellItemCard` component
- Same animations, escape key, body scroll lock
- Same responsive grid
- Same analytics event patterns

### 3. Bug Fixes

#### 3a. buyNowIntent Persistence

**Problem:** `buyNowIntentRef` is a React ref that gets lost when modals open/close in sequence.

**Fix:** Pass `navigateOnClose: '/[tenant]/cart' | 'back'` as a prop to the upsell full-screen, determined at trigger time. The full-screen doesn't manage intent - it navigates to wherever it was told on close.

#### 3b. Escape Key Handling

Add `useEffect` with `keydown` listener for Escape on both full-screens. Escape = same as clicking "Continue" / "No thanks".

#### 3c. Navigation Timing

**Problem:** `PairSuggestionSheet` wraps navigation in `setTimeout(250ms)`, other modals navigate instantly.

**Fix:** All full-screens use the same exit pattern:
1. Trigger Framer Motion exit animation (~200ms)
2. `onAnimationComplete` callback fires navigation
3. No manual `setTimeout` - animation drives timing

#### 3d. Body Scroll Lock

Standardize via shared `useBodyScrollLock()` hook. Sets `document.body.style.overflow = 'hidden'` on mount, restores on unmount.

#### 3e. Image Preloading

Standardize via shared `useImagePreload(urls, count)` hook. Preloads first N item images on mount. Default N=6.

---

## Component Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/components/customer/upsell-full-screen-layout.tsx` | Shared full-screen wrapper (overlay, animations, scroll lock, escape key, header) |
| `src/components/customer/upsell-item-card.tsx` | Shared item card (image, name, price, add button, checkmark state) |
| `src/components/customer/post-add-upsell-screen.tsx` | Combined post-add-to-cart screen (modes A/B/C) |
| `src/hooks/useBodyScrollLock.ts` | Extracted scroll lock hook |
| `src/hooks/useImagePreload.ts` | Extracted image preload hook |

### Modified Files

| File | Changes |
|------|---------|
| `src/components/customer/checkout-upsell-modal.tsx` | Refactored to use `UpsellFullScreenLayout` + `UpsellItemCard` |
| `src/components/customer/product-detail-content.tsx` | Replace 3 modal triggers with single `PostAddUpsellScreen`, fix navigation intent |

### Deprecated Files (No Longer Rendered)

| File | Replaced By |
|------|-------------|
| `src/components/customer/pair-suggestion-sheet.tsx` | `PostAddUpsellScreen` |
| `src/components/customer/bundle-upsell-modal.tsx` | `PostAddUpsellScreen` |
| `src/components/customer/upsell-suggestion-modal.tsx` | `PostAddUpsellScreen` |

### Untouched

- `src/components/customer/bundle-wizard.tsx` - Already full-screen, works well
- `src/components/customer/inline-upgrade-section.tsx` - Product detail page feature, not a modal
- `src/components/customer/bundles-section.tsx` - Menu page section
- `src/components/customer/bundle-card.tsx` - Used by bundles section
- All admin components
- All services/queries (data layer unchanged)
- `src/hooks/useCart.tsx` - Cart logic unchanged
- Analytics event structure (same events, same metadata keys)

### Dependency Chain

```
UpsellFullScreenLayout (wrapper)
  +-- used by PostAddUpsellScreen
  +-- used by CheckoutUpsellModal (refactored)

UpsellItemCard (shared card)
  +-- used by PostAddUpsellScreen
  +-- used by CheckoutUpsellModal (refactored)

useBodyScrollLock + useImagePreload (shared hooks)
  +-- used by UpsellFullScreenLayout
```

---

## Analytics

No changes to event structure. Same events, same metadata:

| Event | Sources | Metadata |
|-------|---------|----------|
| `upsell_shown` | post-add, checkout | itemCount, sourceItemId, bundleId, mode (pairs/bundle/combined) |
| `upsell_clicked` | post-add, checkout | itemId, itemName, price, sourceItemId |
| `upsell_dismissed` | post-add, checkout | suggestionsShown, itemsAdded, sourceItemId |

New metadata field `mode` added to `upsell_shown` to distinguish which layout mode was displayed: `'pairs_only'`, `'pairs_and_bundle'`, `'bundle_only'`, or `'checkout'`.

---

## Out of Scope

- Admin-side improvements (separate effort)
- Bundle Wizard changes (already full-screen and consistent)
- Inline Upgrade Section changes (product detail page feature, not a modal)
- Data layer / service changes
- New feature flags
- Database migrations
