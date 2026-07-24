# TDD Evidence — Tenant logo as menu item image fallback

**Source plan:** none (journeys derived during this TDD run from the request:
"when a menu item image is empty or errors, use the tenant logo as the fallback").

## User journeys

- As a customer, when a menu item has no image, I see the tenant's logo on the
  card instead of a blank tile, so the menu still looks branded.
- As a customer, when a menu item image fails to load, the card swaps to the
  tenant logo rather than showing a broken image.
- As a tenant with no logo, menu items with no image keep their existing empty
  state (no regression).

## What changed

1. `OptimizedImage` (`src/components/shared/optimized-image.tsx`) — new
   `fallbackSrc?: string | null` prop. Used when `src` is empty **or** when the
   primary image fires `onError`. Renders nothing only when both are empty.
2. `getTenantBranding` / `BrandingColors` (`src/lib/branding-utils.ts`) — new
   `logoUrl: string | null` field resolved from `tenant.logo_url`. This is the
   existing per-tenant channel already passed to every card template, so no
   prop-drilling was needed.
3. All 13 card templates (`src/components/customer/card-templates/*.tsx`) — render
   the image when `item.image_url || branding.logoUrl` and pass
   `fallbackSrc={branding.logoUrl}`. Templates with an SVG/name placeholder
   (compact, modern, storefront) keep it as the last resort when neither exists.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `getTenantBranding` exposes `tenant.logo_url` as `logoUrl` | `tests/unit/branding-utils.test.ts` | unit | PASS |
| 2 | `logoUrl` is null when tenant has no logo / empty string / null tenant | `tests/unit/branding-utils.test.ts` | unit | PASS |
| 3 | `OptimizedImage` renders fallback when `src` empty | `tests/unit/optimized-image-fallback.test.tsx` | unit | PASS |
| 4 | `OptimizedImage` prefers primary `src` over fallback | `tests/unit/optimized-image-fallback.test.tsx` | unit | PASS |
| 5 | `OptimizedImage` swaps to fallback on load error | `tests/unit/optimized-image-fallback.test.tsx` | unit | PASS |
| 6 | `OptimizedImage` renders nothing when src+fallback both empty | `tests/unit/optimized-image-fallback.test.tsx` | unit | PASS |
| 7 | ClassicCard (`&&` shape) shows logo when item has no image | `tests/unit/menu-card-logo-fallback.test.tsx` | component | PASS |
| 8 | ModernCard (ternary+placeholder shape) shows logo when item has no image | `tests/unit/menu-card-logo-fallback.test.tsx` | component | PASS |
| 9 | Both templates still show the item image when present | `tests/unit/menu-card-logo-fallback.test.tsx` | component | PASS |

## RED → GREEN

- RED: `npx jest --config jest.config.cjs <three test files>` → 8 failed
  (logoUrl undefined; `fallbackSrc` unknown prop passed to DOM; no `img`
  rendered for imageless cards).
- GREEN: same command → 50 passed / 0 failed after implementation.

## Coverage and known gaps

- New fallback branches (empty→fallback, error→swap, both-empty→null) are each
  covered by a dedicated test.
- `optimized-image.tsx` overall line coverage is below 80% due to **pre-existing**
  untested code (the Cloudinary/ImageKit transform branch and `sizes` parsing
  helpers), not the new logic.
- Full suite: 1834 passed. The 8 remaining failures (mobile-overrides,
  webnegosyo-app printer/order-item-images) are pre-existing and unrelated —
  they fail identically with these changes stashed.
