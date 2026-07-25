# TDD evidence — Branding Studio mobile layout management

**Source plan:** none. Journeys derived during this TDD run from the report
"layout management for mobile isn't working — it doesn't show what it looks like
and it isn't saving".

## User journeys

1. As a merchant, I want to pick a mobile page layout / card template in the
   Branding Studio, so that my phone customers see that layout.
2. As a merchant, I want the Studio's mobile preview to show what my phone will
   actually render, so that I can trust it before publishing.
3. As a merchant, I want everything I publish in the Studio (search bar, flash
   screen, per-device overrides) to reach my live site on desktop and mobile.

## Root causes (verified against production data)

| # | Bug | Evidence |
|---|-----|----------|
| 1 | Legacy `mobile_page_layout` / `mobile_card_template` / `mobile_header_template` columns shadowed the Studio's `mobile_overrides`, so the Studio's choice never rendered — on the live phone or in its own 390px preview iframe. | `tenants` row `super6`: `mobile_overrides = {page_layout: default, card_template: storefront}` while `mobile_page_layout = sidebar`, `mobile_card_template = modern`. 11 tenants carry a legacy layout, 6 a legacy card, 2 a legacy header. |
| 2 | `TENANT_STOREFRONT_SELECT` never projected `mobile_overrides`, so `applyMobileOverrides` had nothing to overlay on a real phone. Same gap for `search_bar_*` and `flash_screen_*`, which the menu page renders. | The column list in `src/lib/queries/tenant-storefront-select.ts` vs the reads in `branding-utils.ts` / `flash-loader.ts`. This is the failure mode the Studio preview hides, because the preview merges the full draft. |
| 3 | `writeBrandingWithClient` kept `mobile_overrides` in the missing-column retry payload, so on a database without the migration the retry fails too and the whole publish is lost. | `ROLLOUT_DEPENDENT_FIELDS` omitted the column. |

## Task report

| Task | Validation command | RED | GREEN |
|------|--------------------|-----|-------|
| Override beats legacy column | `npx jest tests/unit/mobile-overrides.test.ts tests/unit/storefront-device-layout.test.ts` | `resolveDeviceTemplate is not a function`; `Cannot find module '@/lib/storefront-device-layout'` | 42 passing |
| Storefront reads the override map | `npx jest tests/unit/tenant-storefront-select.test.ts tests/unit/branding-preview-mobile-overrides.test.ts` | `Expected value: "mobile_overrides"` not in projection; `selectEffectiveMobileOverrides is not a function` | passing |
| Publish survives an unmigrated DB | `npx jest tests/unit/branding-service.test.ts` | retry payload still contained `mobile_overrides` | passing |

Whole-suite run after the fix: `npx jest` → **2179 passing, 7 failing** in 3
suites that were already failing before this work and are unrelated
(`webnegosyo-app/lib/printer-native-load.test.ts`,
`webnegosyo-app/lib/order-item-images.test.ts`, and the untracked WIP
`tests/unit/checkout-cart-empty-guard.test.ts`).

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | A Studio mobile override beats a stale legacy `mobile_*` column | `tests/unit/storefront-device-layout.test.ts:prefers the Studio mobile override over a stale legacy mobile column` | unit | PASS |
| 2 | A legacy column still applies when the Studio has no override (no regression for old tenants) | `…:still honors a legacy mobile column when the Studio has no override` | unit | PASS |
| 3 | `'inherit'` and blanks mean "use the desktop value" at both levels | `tests/unit/mobile-overrides.test.ts:treats 'inherit' as blank…` | unit | PASS |
| 4 | A mobile-only layout or card difference triggers the dual render | `…:flags a dual render only when the mobile layout or card differs` | unit | PASS |
| 5 | The storefront projection selects `mobile_overrides` | `tests/unit/tenant-storefront-select.test.ts:projects mobile_overrides…` | unit | PASS |
| 6 | The projection selects every `search_bar_*` and `flash_screen_*` column the page reads, with no duplicates | `…:projects %s`, `…:projects each column exactly once` | unit | PASS |
| 7 | The effective mobile map is saved overrides + unpublished draft, and a blanked draft entry removes the key | `tests/unit/branding-preview-mobile-overrides.test.ts` | unit | PASS |
| 8 | A publish against a database missing `mobile_overrides` still saves the rest of branding | `tests/unit/branding-service.test.ts:drops mobile_overrides on the retry…` | unit | PASS |

## Coverage

`npx jest --coverage` over the touched modules: **94.23% statements, 96.96%
branches** (`storefront-device-layout.ts` 100%, `mobile-overrides.ts` 85.88%,
`tenant-storefront-select.ts` 100%) — above the 80% bar.

## Known gaps

- No end-to-end test drives the Studio UI in a browser; the fix is covered at
  the pure-resolution and projection layers.
- `supabase/migrations/20260725130000_backfill_mobile_layout_overrides.sql` is
  **not applied yet**. It is display-only convergence: the runtime keeps the
  legacy fallback, so rendering is already correct without it, but until it runs
  the Studio's mobile tab shows "inherits Desktop" for the 11 tenants whose
  phone layout still comes from a legacy column.
