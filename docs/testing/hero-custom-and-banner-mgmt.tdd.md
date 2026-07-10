# TDD Evidence — Hero "custom" template option + inline banner management

## Source plan

No `*.plan.md` supplied. Journeys derived from the request: *"on the hero
section management we want to be able to use the templates and have an option to
use the custom hero section that we made … also make sure that the banner is
also available for management on the branding editor."*

Two clarifications were confirmed with the user:
- **Hero:** expose the custom hero as one more choice in the existing Style
  dropdown (not a separate mode switch).
- **Banner:** full inline management (upload / add / remove / reorder + title /
  description + toggle) inside the Branding Studio.

## User journeys

- As a merchant, I want to pick a hero **template/preset** OR my own **custom**
  Hero Designer layout from one dropdown, so I can switch between them without
  losing either.
- As a merchant who built a custom hero **before** this feature existed, I want
  it to keep rendering, so nothing regresses.
- As a merchant, I want to manage my **promotion banners** (image, title,
  description, order) directly in the Branding Studio with a live preview,
  instead of being told to go to a Settings page that has no UI.

## Task report

| Behavior | Validation command | RED → GREEN |
|----------|--------------------|-------------|
| `shouldUseCustomHero` / `isConcreteHeroPreset` decision (custom vs preset, back-compat) | `npx jest hero-mode.test.ts` | RED: `Cannot find module '@/lib/hero-mode'` → GREEN 8/8 |
| Registry exposes `custom` hero style + `promotion_banners` as an editable `banners` field; array flows through resolve/publish | `npx jest branding-hero-banner-registry.test.ts` | RED: option/field absent → GREEN 3/3 |
| `BannersRow` add / remove / reorder / edit / upload, all immutable | `npx jest branding-banners-row.test.tsx` | RED: `banners` type renders nothing → GREEN 6/6 (5 assertions across it blocks) |

RED excerpt:

```
Cannot find module '@/lib/hero-mode' from 'tests/unit/hero-mode.test.ts'
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name `/add banner/i`
Test Suites: 3 failed, 3 total   Tests: 9 failed, 9 total
```

GREEN excerpt:

```
PASS tests/unit/branding-banners-row.test.tsx
PASS tests/unit/branding-hero-banner-registry.test.ts
PASS tests/unit/hero-mode.test.ts
Test Suites: 3 passed, 3 total   Tests: 16 passed, 16 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `isConcreteHeroPreset` is true for named presets, false for theme/custom/unknown | `hero-mode.test.ts` | unit | PASS |
| 2 | Explicit `custom` + a saved design renders custom | `hero-mode.test.ts` | unit | PASS |
| 3 | A concrete preset wins over a lingering saved design | `hero-mode.test.ts` | unit | PASS |
| 4 | Legacy design + default/blank preset still renders custom (no regression) | `hero-mode.test.ts` | unit | PASS |
| 5 | `custom` with no design falls through (no crash) | `hero-mode.test.ts` | unit | PASS |
| 6 | Hero Style dropdown offers `custom` | `branding-hero-banner-registry.test.ts` | unit | PASS |
| 7 | `promotion_banners` is a registered editable `banners` field | `branding-hero-banner-registry.test.ts` | unit | PASS |
| 8 | Banner array passes through `resolveFieldValue` + `buildPublishPayload` | `branding-hero-banner-registry.test.ts` | unit | PASS |
| 9 | One editor block per banner; Add appends; Remove deletes | `branding-banners-row.test.tsx` | unit | PASS |
| 10 | Title edit + reorder + image upload emit new immutable arrays | `branding-banners-row.test.tsx` | unit | PASS |

## Implementation

- `src/lib/hero-mode.ts` (new) — pure `shouldUseCustomHero` / `isConcreteHeroPreset`.
- `src/lib/storefront-theme.ts` — `'custom'` added to `HeroPreset`; `resolveHeroPreset` maps it to null (like `'theme'`).
- `src/components/customer/storefront-hero.tsx` — custom-vs-preset branch now uses `shouldUseCustomHero`.
- `src/lib/branding-registry.ts` — `'custom'` in the hero Style options; new `'banners'` field type + `promotion_banners` field; note updated.
- `src/components/admin/branding-studio/field-row.tsx` — `BannersRow` renderer (reuses `@/components/shared/image-upload`).
- `src/app/actions/branding.ts` — hero enum gains `'custom'`; `promotion_banners` tolerates a blank "Reset section" → `[]`.

Preview needs no new wiring: `useBrandingPreviewTenant` already merges the whole
draft (including a `promotion_banners` array) over the tenant columns.

## Coverage and known gaps

- Regression sweep: `npx jest` → **1472 passed**, 3 pre-existing failures in
  `webnegosyo-app/` (printer/order-image work, uncommitted before this task —
  unrelated to these files).
- `npx tsc --noEmit`: no errors in any changed file (10 pre-existing errors live
  only in unrelated product-detail/revalidate test files).
- `npx eslint` on all six changed files: clean.
- **Gap:** the storefront hero component itself is not rendered in a test
  (HeroRenderer pulls a canvas); the decision it delegates to is covered by
  `hero-mode.test.ts`. No E2E was added for the drag-free reorder UI.
