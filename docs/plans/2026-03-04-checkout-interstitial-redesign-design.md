# Checkout Interstitial Redesign

**Date:** 2026-03-04

## Problem

1. No admin UI to select which items appear in the checkout interstitial
2. Slow loading — items fetched on-demand when modal opens (500ms-2s delay)
3. Generic design — doesn't feel like a compelling fast-food kiosk upsell

## Design Decisions

- **Item selection**: Dedicated searchable item picker in Checkout Settings tab
- **Item logic**: Manual selection only — no fallback tiers. If 0 items selected, interstitial skipped
- **Loading**: Prefetch on cart page load — modal appears instantly with data ready
- **Design**: McDonald's kiosk-style — large images, bold pricing, prominent Add buttons
- **Mobile layout**: Full-screen takeover (not bottom sheet)
- **Desktop layout**: Centered modal with 4-column grid

## Admin Item Selection

Add to existing Menu Engineering > Checkout Settings tab:
- Grid of all available menu items with checkboxes
- Search/filter by name or category
- Selected items shown at top
- Saves to existing `show_in_checkout_upsell` column on `menu_items`
- Manual selection only — replaces the 4-tier waterfall when items are selected

## Instant Loading

- Prefetch upsell items via `useEffect` when cart page renders
- Store in component state
- Modal opens instantly with cached data on checkout click
- Edge case: if prefetch still in-flight, show brief spinner

## Visual Design

### Mobile (Full-Screen Takeover)
- Full viewport height, white background
- Close button (X) top-right
- Header: "Would you like to add...?" / "Complete your meal!"
- 2-column grid of item cards
- Each card: large image (4:3), item name, price, "+ Add" button
- Discounted items: strikethrough original price + sale price
- "Added!" confirmation: button turns green with checkmark
- Footer: "No thanks, checkout" secondary CTA

### Desktop (Centered Modal)
- Max-width ~2xl, centered with backdrop
- 4-column grid
- Same card design, scaled for desktop
- Close button top-right

### Animations
- Mobile: slide up from bottom
- Desktop: scale + fade in
- Add button: spring animation on click
- No skeleton loaders (data prefetched)

### Branding
- Respects all 7 existing `checkout_modal_*` color variables

## Technical Notes

- Existing column: `menu_items.show_in_checkout_upsell` (boolean)
- Existing server action: `getCheckoutUpsellsAction` — simplified to only query manual items
- Existing settings: `checkout_upsell_enabled`, `checkout_upsell_title`, `checkout_upsell_subtitle`, `checkout_upsell_max_items`
- Cart page: `src/app/[tenant]/cart/page.tsx` — add prefetch logic
- Modal component: `src/components/customer/checkout-upsell-modal.tsx` — full redesign
- Admin settings: `src/components/admin/menu-engineering-dashboard.tsx` — add item picker
