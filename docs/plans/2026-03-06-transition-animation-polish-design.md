# Transition & Animation Polish Design

**Date:** 2026-03-06
**Status:** Approved

## Problem

Multiple UX issues with transitions across the upsell flow:

1. **InlineUpgradeSection** has zero animations — appears/disappears instantly
2. **Upgrade navigation** (selecting an upgrade item) causes a jarring page switch with no transition
3. **PairSuggestionSheet** uses fade-only animation — pops up suddenly after add-to-cart
4. **CheckoutUpsellModal** uses fade-only animation — pops up with no physical transition
5. **All modal JS bundles are lazy-loaded** via `next/dynamic`, adding delay before any animation can start
6. **Return-to-menu navigation** feels laggy — no dismissal animation before `router.back()`
7. **Image loading** in suggestion modals causes visible pop-in

## Approach

Per-component Framer Motion animation fixes with eager bundle preloading. No global page transition wrapper.

## Design

### 1. Eager Bundle Preloading

In `product-detail-content.tsx`, add `useEffect` on mount to fire `import()` for all upsell modal components:
- `inline-upgrade-section`
- `pair-suggestion-sheet`
- `upsell-suggestion-modal`
- `bundle-upsell-modal`
- `checkout-upsell-modal`

This ensures JS is downloaded and cached before any modal opens, eliminating the first-open delay.

### 2. InlineUpgradeSection — Slide-up Entry

Currently has zero animations. Add:
- Wrap in `AnimatePresence` + `motion.div`
- Entry: `y: '100%' → y: 0` with spring (`damping: 28, stiffness: 350`)
- Backdrop: `opacity: 0 → 0.5` fade-in simultaneously
- Exit: slide down + backdrop fade out
- Brief 200ms delay before auto-opening so user sees the item first

### 3. Upgrade Navigation — Slide Transition

When user selects an upgrade and navigates:
- `isTransitioning` state triggers slide-left exit animation (200ms)
- After animation completes, fire `router.replace` to target item
- New page loads with a slide-in-from-right entrance via wrapper in ProductDetailContent

### 4. PairSuggestionSheet — Slide-up Entry

Change from opacity fade to:
- Entry: `y: '100%' → y: 0` with spring physics
- Exit: slide down (`y: 0 → y: '100%'`) + backdrop fade
- Consistent with InlineUpgradeSection

### 5. Image Preloading for Suggestions

Add eager image preloading for first 6 suggestion items when data is available, using `new Image()` with Cloudinary-transformed URLs.

### 6. CheckoutUpsellModal — Slide-up Entry

Same slide-up entry treatment for consistency across all full-screen overlays. Exit: slide down.

### 7. Return-to-Menu Navigation

After PairSuggestionSheet closes:
- Sheet slides down (spring exit animation)
- `onAnimationComplete` callback fires `router.back()`
- Sheet fully dismissed before navigation happens

### 8. Animation Consistency Standards

All full-screen overlays share:
- **Entry**: `y: '100%' → y: 0`, spring `damping: 28, stiffness: 350`
- **Exit**: `y: 0 → y: '100%'`, tween 200ms ease-out
- **Backdrop**: `opacity: 0 → 0.5` (150ms), exit 150ms
- **Grid stagger**: 0.03s, cap at 8 items max visible stagger

## Files to Modify

1. `src/components/customer/product-detail-content.tsx` — eager preloading + transition wrapper
2. `src/components/customer/inline-upgrade-section.tsx` — slide-up animation
3. `src/components/customer/pair-suggestion-sheet.tsx` — slide-up + image preload + exit nav
4. `src/components/customer/checkout-upsell-modal.tsx` — slide-up animation
5. `src/hooks/useProductDetailModals.ts` — delayed auto-open for upgrade section
