# TDD Evidence — Rich storefront hero presets

**Source plan:** none — journeys derived during this TDD run from the reference
design `Restaurant Storefront.dc.html` (imported via the Claude Design MCP,
project `58ffe87a-1a94-4773-a43a-efdd350eb804`).

## Goal

Apply the 6 hero templates from the reference storefront design *exactly* to the
tenant storefront's `hero_preset` system. The presets already existed as a
thin, text-only implementation; this work upgrades them to faithfully reproduce
the design: uppercase kicker, 1–2 CTA buttons, decorative accent-toned tiles
carrying the brand initial, and a featured-product badge on the split hero.

### Product decisions (confirmed with the user)

- **Image tiles:** reproduce exactly — accent/primary-toned blocks with the brand initial.
- **Kicker & CTAs:** new editable branding fields (migration).
- **Split badge:** a **featured product** slot (pick a menu item) instead of a fake "★ 4.9 · 2,400+ reviews" rating.

## User journeys

1. As a merchant, I pick a hero style (editorial/split/banner/collage/minimal/centered) and my storefront hero adopts that layout with kicker + CTAs.
2. As a merchant, I set a kicker and button labels in the Branding Studio and they appear on the hero; leaving them blank hides them (zero-regression additive behavior).
3. As a merchant, I select a featured product; it shows as a badge on the split hero. With none selected, no badge (and no fake rating) renders.
4. As a customer, clicking the primary hero CTA scrolls me to the menu.

## Task report

| Behavior | Validation command | Result | Guarantee |
|----------|--------------------|--------|-----------|
| RED reproducer for rich presets | `npx jest tests/unit/components/hero-preset.test.tsx tests/unit/lib/branding-registry.test.ts` | 9 failed / 33 passed (RED) | Kicker/CTA/tiles/featured-product + registry fields were genuinely missing |
| GREEN after implementation | same command | 42 passed | All rich-hero behaviors implemented |
| No regressions across unit suite | `npx jest tests/unit` | 63 suites / 1010 passed | Shared changes (registry, branding action, field-row, layout-default, menu-server projection) broke nothing |
| Types | `npx tsc --noEmit` (changed files) | clean | New props/fields typecheck (pre-existing unrelated test-file TS errors untouched) |
| Lint | `npx eslint <changed files>` | clean | No lint violations |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Editorial renders kicker, title, and both CTA buttons | `hero-preset.test.tsx` | unit | PASS |
| 2 | Minimal renders a single primary CTA, no secondary | `hero-preset.test.tsx` | unit | PASS |
| 3 | Banner renders both CTAs in the accent band | `hero-preset.test.tsx` | unit | PASS |
| 4 | Split/collage/centered render decorative tiles with the brand initial | `hero-preset.test.tsx` | unit | PASS |
| 5 | Split shows featured product name + price when set | `hero-preset.test.tsx` | unit | PASS |
| 6 | Split omits the badge (and any "reviews" text) when no product set | `hero-preset.test.tsx` | unit | PASS |
| 7 | Kicker/CTAs omitted entirely when blank (additive, no-regression) | `hero-preset.test.tsx` | unit | PASS |
| 8 | Primary CTA click invokes the handler | `hero-preset.test.tsx` | unit | PASS |
| 9 | Registry exposes hero_kicker/CTA text fields + hero_featured_product_id product field on the storefront surface | `branding-registry.test.ts` | unit | PASS |

## Files changed

- `src/components/customer/hero-preset.tsx` — faithful 6-template rewrite (kicker, CTAs, tiles, featured badge).
- `src/components/customer/layouts/layout-default.tsx` — resolves featured product from `allMenuItems`, passes new hero props, wires primary CTA → scroll to `#storefront-menu`.
- `src/lib/branding-registry.ts` — new `product` field type + hero content fields.
- `src/components/admin/branding-studio/field-row.tsx` — `ProductRow` (dynamic menu-item picker).
- `src/components/admin/branding-studio/branding-studio.tsx` + `src/app/[tenant]/admin/branding/page.tsx` — thread the tenant's product list into the picker.
- `src/app/actions/branding.ts` — zod schema + rollout-safe omit list; coerce empty `hero_featured_product_id` → NULL (uuid column).
- `src/app/[tenant]/menu/menu-server.tsx` — project the 4 new columns to the client.
- `src/types/database.ts` — Tenant fields.
- `supabase/migrations/20260704040000_hero_preset_content.sql` — additive columns.

## Coverage & known gaps

- New behavior is covered by component + registry unit tests (all PASS).
- **Migration not yet applied to the remote DB.** The save action degrades gracefully (`ROLLOUT_DEPENDENT_FIELDS` omit path) until `20260704040000_hero_preset_content.sql` is applied, so nothing breaks pre-migration — the hero content fields simply no-op.
- Pre-existing unrelated TS errors in `tests/unit/api/revalidate-menu.test.ts` and `tests/unit/lib/product-detail-theme.test.ts` are not touched by this work.
- Hero presets apply to the `default` page layout (the only layout that consumes `resolveHeroPreset`), matching prior behavior.

## Follow-up fix — "hero templates still not showing" (layout coverage bug)

**Root cause:** the hero preset was only rendered by `layout-default.tsx`. Tenants
on other page layouts (`list`/`magazine`/`mosaic` rendered their own plain hero;
`sidebar`/`grid-focus` rendered none), so picking a preset did nothing. The two
tenants that had selected a preset were on `sidebar` and `mosaic`.

**Fix (TDD):** extracted the whole hero decision into a shared
`src/components/customer/storefront-hero.tsx` (`StorefrontHero`) used by every
hero-bearing layout. Each layout passes its own plain hero as `children`, so the
plain look is unchanged while a chosen `hero_preset` (or legacy `hero_design`)
now wins on **every** layout.

| # | What is guaranteed | Test | Result |
|---|--------------------|------|--------|
| 10 | A selected preset renders regardless of layout (split shows a brand-initial tile) | `storefront-hero.test.tsx` | PASS |
| 11 | Plain hero renders when preset is theme/unset | `storefront-hero.test.tsx` | PASS |
| 12 | Nothing renders when the hero is disabled | `storefront-hero.test.tsx` | PASS |
| 13 | Nothing renders for a v4 block-hero design (avoids double hero) | `storefront-hero.test.tsx` | PASS |
| 14 | `requireExplicit` suppresses the plain fallback but still shows a chosen preset | `storefront-hero.test.tsx` | PASS |

- RED: `npx jest tests/unit/components/storefront-hero.test.tsx` → module-not-found (component absent).
- GREEN: same command → 5 passed; full suite `npx jest tests/unit` → 64 suites / 1015 passed.
- Layouts wired: `default`, `list`, `magazine`, `mosaic` (all had a hero). `sidebar`/`grid-focus` render no hero today and their only affected tenant has the hero disabled — `StorefrontHero` already supports them via `requireExplicit` as a low-risk follow-up.

## Follow-up fix — hero preset never shows on `sidebar`/`grid-focus` layouts

**Symptom:** A tenant (`elira-levira`) on `page_layout = sidebar` saw the plain
storefront hero (or none) no matter which `hero_preset` they picked — the rich
split/centered/etc. templates from the reference design never appeared.

**Root cause (3 stacked, only #1 is a code defect):**

1. **Code:** `layout-sidebar.tsx` and `layout-grid-focus.tsx` were the only two
   layouts that never rendered `StorefrontHero`, so no preset could show on them.
   (Deferred in the section above; the affected tenant later moved to `sidebar`.)
2. **Data:** `hero_section_enabled = false` — hero turned off.
3. **Data:** `hero_preset = 'centered'`, not the `split` template the design shows.

**Fix (TDD):** wired `StorefrontHero` into both layouts with `requireExplicit`,
so they stay hero-less unless a preset/design is explicitly set (zero regression),
but a chosen preset now renders. Restored `allMenuItems`/`heroOverride` to both
layouts' props (previously `Omit`-ted) so featured-product + preview overrides flow.

| # | What is guaranteed | Test | Result |
|---|--------------------|------|--------|
| 15 | `sidebar` renders a chosen split preset (brand-initial tile) | `layout-hero-coverage.test.tsx` | PASS |
| 16 | `grid-focus` renders a chosen split preset (brand-initial tile) | `layout-hero-coverage.test.tsx` | PASS |

- RED: `npx jest tests/unit/components/layout-hero-coverage.test.tsx` → 2 failed (no tile on either layout).
- GREEN: same command → 2 passed; hero suites `storefront-hero` + `hero-preset` + `layout-hero-coverage` → 18 passed. Lint + typecheck clean on changed files.
- **Data toggles still required per-tenant** to see the split design: enable the hero and set `hero_preset = 'split'` in the Branding Studio (the code fix alone does not change any tenant's saved content).

## Feature — hero tile becomes a real product card (image + price + Add + link)

**Ask:** The decorative hero tile on split (and the other tile-bearing presets)
should be able to carry a **highlighted product** — showing its image and price
with a direct **Add to cart**, and clicking it opens the product page. When no
product is attached, the tile should instead show a **raw image with a clickable
link**. Otherwise it stays the decorative brand-initial tile.

**Product decisions (confirmed with the user):**
- **No-product fallback:** new `hero_image_url` + `hero_link_url` tenant columns
  (a pasted image URL + optional link). Migration `20260704050000`.
- **Add behavior:** reuse the menu's own `onItemSelect` — bare items add straight
  to cart with a toast; items needing choices open the customization sheet. Both
  the card click and the Add button call it, so required variations are never
  skipped. The link scheme is sanitized (blocks `javascript:`/`data:`).

**Scope:** the media panel is reused by `split` (main tile), `collage` (first
tile), and `centered` (center tile). `banner`/`minimal`/`editorial` have no tile.

| # | What is guaranteed | Test | Result |
|---|--------------------|------|--------|
| 17 | Split renders product image + price + Add button when a product w/ image is attached | `hero-preset.test.tsx` | PASS |
| 18 | Add button click opens the product (calls onSelect once) | `hero-preset.test.tsx` | PASS |
| 19 | Clicking the product image opens the product (calls onSelect once) | `hero-preset.test.tsx` | PASS |
| 20 | No product but fallback image+link → clickable linked image, no Add button | `hero-preset.test.tsx` | PASS |
| 21 | Unsafe `javascript:` link on the fallback image is sanitized out | `hero-preset.test.tsx` | PASS |
| 22 | Neither product nor image → decorative brand-initial tile (regression) | `hero-preset.test.tsx` | PASS |
| 23 | Collage shows the attached product image in its main tile | `hero-preset.test.tsx` | PASS |
| 24 | Centered shows the attached product image in its main tile | `hero-preset.test.tsx` | PASS |

- RED: `npx jest tests/unit/components/hero-preset.test.tsx` → 6 failed / 13 passed (media panel absent).
- GREEN: same command → 19 passed. Hero + registry suites (`hero-preset`, `storefront-hero`, `layout-hero-coverage`, `branding-registry`) → 57 passed. Full `tests/unit` → **65 suites / 1025 passed** (no regressions). Lint + `tsc --noEmit` clean on changed files.

**Files changed:**
- `src/components/customer/hero-preset.tsx` — `HeroMediaPanel` (product card / linked image / decorative tile), `safeHref`, new `fallbackMedia` prop, richer `HeroFeaturedProduct` (imageUrl + onSelect); wired into split/collage/centered.
- `src/components/customer/storefront-hero.tsx` — new `onSelectProduct` prop; builds the featured product with image + select handler and the fallback media from tenant.
- All 6 hero-bearing layouts — pass `onSelectProduct={onItemSelect}` so the hero card behaves like a menu card.
- `src/lib/branding-registry.ts` — `hero_image_url` / `hero_link_url` text fields + updated hero note.
- `src/app/actions/branding.ts` — zod fields, empty→NULL coercion, rollout-safe omit list.
- `src/app/[tenant]/menu/menu-server.tsx` — project the 2 new columns.
- `src/types/database.ts` — `hero_image_url` / `hero_link_url` on Tenant.
- `supabase/migrations/20260704050000_hero_featured_media.sql` — additive nullable columns.

**Coverage & known gaps:**
- **Migration `20260704050000` not yet applied to the remote DB.** The save action’s `ROLLOUT_DEPENDENT_FIELDS` omit path degrades gracefully until it is applied (the two fields just no-op). The featured-product path works today (`hero_featured_product_id` shipped in `20260704040000`).
- The fallback image uses a plain `<img>` (one above-the-fold hero image) rather than the ImageKit `OptimizedImage`, to keep the presentational component dependency-light; acceptable for a single hero image, revisit if needed.
- No image **uploader** in the Studio — merchants paste an image URL (KISS). An upload field is a possible follow-up.
