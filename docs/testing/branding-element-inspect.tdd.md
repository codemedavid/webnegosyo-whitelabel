# TDD Evidence — Branding Studio element-level inspect & configure

**Source plan:** none — journeys derived during this TDD run from the request:
"select or inspect each and every specific element (cards, product detail,
cart, hero, header) and configure all of those."

## User journeys

1. As a merchant, I want to click any specific element in the Branding Studio
   preview (header logo/name/tagline/cart button, hero title/kicker/CTAs,
   card title/price/description, quick-view details, cart drawer rows/summary/
   checkout button, product-detail name/options/buttons) so the editor jumps
   to the exact field that styles it.
2. As a merchant, I want to configure the hero background, kicker color and
   CTA button colors individually, so my hero isn't locked to the global
   accent color.

## Round 1 — element-level inspect scopes (existing fields)

- **RED:** `795d427` — 33 failing tests (`npx jest tests/unit/branding-inspect.test.ts tests/unit/branding-element-inspect.test.tsx` → `Tests: 33 failed, 15 passed`), failing because 23 scope keys were missing from `BRANDING_SCOPE_MAP` and components carried no element tags.
- **GREEN:** `c94afc2` — same command → `Tests: 48 passed`. Neighboring suites (hero-preset, branding-inspector, preview-frame, menu-item-card, registry, branding-utils) → `99 passed`.

New scopes (each lands on its exact field row): header logo/title/tagline/cart,
hero title/description, quick-view title/price/description, cart
item/item-price/summary/checkout-button, product name/description/sale-badge/
variation-option/addon-option/related-item/quantity/add-to-cart/buy-now/
total-price. DOM tags added in: `header-parts.tsx`, `storefront-hero.tsx`,
`hero-preset.tsx` (all 6 presets), `item-detail-modal.tsx`, `cart-drawer.tsx`
(item + bundle rows), `product-detail-content.tsx`, `product-detail-related.tsx`.

## Round 2 — hero element color fields (new tenant columns)

- **RED:** `478bcf5` — `npx jest tests/unit/hero-element-colors.test.tsx` → `Tests: 11 failed, 1 passed` (fields absent from registry, scopes absent, components ignored overrides).
- **GREEN:** `f9dc5db` — same command → `Tests: 12 passed`. Full branding/hero regression (11 suites) → `Tests: 201 passed`. ESLint on all touched files → clean.

New columns on `tenants` (migration `20260710010000_hero_element_colors.sql`,
**applied to the remote Supabase project via MCP `apply_migration`**):
`hero_background_color`, `hero_kicker_color`, `hero_cta_primary_color`,
`hero_cta_primary_text_color`, `hero_cta_secondary_text_color`. Registry
inherit chains mirror runtime fallbacks (accent / button-primary-text /
hero-title). `saveBrandingAction` Zod schema accepts them via
`cssColorString()` (CSS-injection guarded).

Note: card add-button colors were planned then dropped — card templates render
no add button, so cards are fully covered by existing fields.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | All 23 element scopes resolve to a real surface, section and field | `branding-inspect.test.ts` — "element-level scopes" | unit | PASS |
| 2 | Every fieldId stays inside its mapped section (fails on rename) | `branding-inspect.test.ts` — "keeps every fieldId inside…" | unit | PASS |
| 3 | Header logo/name/tagline/cart button carry their scope tags | `branding-element-inspect.test.tsx` | component | PASS |
| 4 | All 6 hero presets + plain fallback tag title & description | `branding-element-inspect.test.tsx` | component | PASS |
| 5 | 5 hero color fields exist with correct inherit chains | `hero-element-colors.test.tsx` | unit | PASS |
| 6 | Inherit cascade: unset → accent default; tenant accent → inherited; explicit wins | `hero-element-colors.test.tsx` | unit | PASS |
| 7 | Kicker/CTA scopes resolve to the Hero section fields | `hero-element-colors.test.tsx` | unit | PASS |
| 8 | HeroPresetSection applies kicker/CTA/background overrides; defaults preserved when unset | `hero-element-colors.test.tsx` | component | PASS |
| 9 | StorefrontHero passes tenant hero_* colors through to the preset | `hero-element-colors.test.tsx` | component | PASS |

## Coverage and known gaps

- 201 tests across the 11 branding/hero suites pass (`npx jest …` per above).
- Cart drawer, quick-view modal and product-detail tags are asserted via the
  scope-map validity tests, not runtime renders (those components need heavy
  store/Sheet mocking); verify visually via Branding Studio → Inspect.
- Cart/checkout previews still show the admin's own cart (pre-existing).
- The `bold`/`magazine`/`neon` card templates don't use the standard card
  color fields for the title — element clicks there fall back to the section
  (pre-existing, documented in memory).
