# TDD Evidence — Branding editor mobile overrides fix

**Date:** 2026-07-22
**Source plan:** none — journeys derived during this TDD run from the bug report
("mobile card template change doesn't work and shows no change; some options
aren't updating").

## User journeys

1. As a merchant, when I change the **mobile card template** in the Branding
   Studio, the preview and the published storefront must use it — not silently
   fall back to a stale template.
2. As a merchant, when I publish **any** mobile-device override (colors, card
   template, layout, header), the live storefront must reflect it.

## Root causes found

1. **Runtime override drop.** `TENANT_STOREFRONT_SELECT` did not project
   `mobile_overrides`, so on the published menu page the column read `undefined`
   and `applyMobileOverrides` was a silent no-op — every mobile override was
   dropped after publish (same failure class as the earlier hero-color bug).
2. **Template shadowing.** The Studio writes the mobile card/layout/header
   choice into `mobile_overrides.<col>`, but the storefront read the dedicated
   legacy `mobile_card_template` / `mobile_page_layout` / `mobile_header_template`
   column *with precedence* via `mobileOrDesktop(...)`. A stale legacy column
   completely shadowed the Studio edit (no effect, no preview change).

## Fix summary

- `src/lib/queries/tenant-storefront-select.ts` — project `mobile_overrides`.
- `src/lib/mobile-overrides.ts` — new pure `resolveDeviceTemplate(override,
  legacyColumn, desktop)`: override is authoritative, legacy column is a
  fallback, blank/`inherit` → desktop.
- `src/hooks/use-branding-preview.ts` — expose the merged saved+draft override
  map on `result.mobile_overrides` so preview consumers that read the raw map
  reflect the unsaved edit.
- `src/app/[tenant]/menu/menu-client.tsx` — resolve the three per-device
  templates override-first via `resolveDeviceTemplate` instead of the
  legacy-column-first `mobileOrDesktop`.

## Task report / test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Storefront select projects `mobile_overrides` (+ legacy mobile template cols) | `tests/unit/tenant-storefront-select.test.ts` | unit | PASS |
| 2 | `resolveDeviceTemplate` prefers override, falls back to legacy col, then desktop; treats blank/`inherit`/non-string as unset | `tests/unit/mobile-overrides.test.ts` | unit | PASS |
| 3 | `merge`/`applyMobileOverrides` set/remove keys immutably and ignore blanks | `tests/unit/mobile-overrides.test.ts` | unit | PASS |
| 4 | Preview hook overlays draft mobile overrides AND exposes the merged map on a mobile viewport | `tests/unit/hooks/use-branding-preview.test.tsx` | unit | PASS |

### Validation commands

- RED (before fix): `npx jest --config jest.config.cjs tests/unit/mobile-overrides.test.ts tests/unit/tenant-storefront-select.test.ts tests/unit/hooks/use-branding-preview.test.tsx` → **7 failed, 21 passed**.
- GREEN (after fix): same command → **28 passed**.
- Full suite: `npx jest --config jest.config.cjs` → **1809 passed, 3 failed** — the 3 failures are in `webnegosyo-app/lib/*` (merchant mobile app, printer/order-image mock hoisting), confirmed pre-existing via `git stash`, untouched by this change.
- Lint: `npx eslint` on the four changed source files → clean.

## Known gaps / follow-ups

- `src/lib/product-detail-data.ts` `getCachedTenantBySlug` does not project
  tenant-level `mobile_overrides`; the product page's own per-device styling
  uses `product_detail_settings.mobile_overrides` (separately handled), so
  tenant-level mobile *color* overrides on the product page remain unapplied.
  Out of scope for the reported menu-page bug; noted for a future pass.
