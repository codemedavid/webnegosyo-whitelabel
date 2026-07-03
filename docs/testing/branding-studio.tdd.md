# TDD Evidence — Branding Studio

**Source plan**: inline `/ecc:plan` output (this session) — "Branding Studio (replaces pencil/modal editor)", confirmed by the user with "proceed".
**Branch**: `fix/lalamove-missing-delivery-details`
**Date**: 2026-07-04

## User journeys

1. As a tenant admin, I open Branding Studio (`/[tenant]/admin/branding`), pick a surface from the rail, edit colors/toggles/templates, and see the **real storefront** update instantly in the preview.
2. As a tenant admin, a blank color field shows what it inherits from ("↳ Inherits · Primary"), and Reset returns a field to its inherited value.
3. As a tenant admin, I hit **Publish** and the exact draft persists to the `tenants` table via the existing validated server action; customers see it after revalidation.
4. As a tenant admin, choosing "inherit" for a mobile template clears the mobile override rather than storing a bogus template name.
5. As a customer, the storefront no longer shows pencil edit buttons or the branding modal.

## RED / GREEN checkpoints (all on this branch)

| Stage | Commit | Evidence |
|---|---|---|
| RED (registry) | `d9d9935` test: add failing spec for branding studio registry + cascade resolver | `npx jest tests/unit/lib/branding-registry.test.ts` → "Cannot find module '@/lib/branding-registry'" (missing implementation) |
| GREEN (registry) | `27cbfeb` feat: branding studio field registry + cascade resolver | same command → 25 passed |
| RED (bridge) | commit "test: add failing spec for branding preview bridge hook" | `npx jest tests/unit/hooks/use-branding-preview.test.tsx` → module not found |
| GREEN (bridge) | commit "feat: branding preview bridge hook" | same command → 8 passed |
| RED→GREEN (inherit) | `299b5d4` | test "publishes the mobile 'inherit' choice as null" observed failing (1 failed, 25 passed), then passing after `buildPublishPayload` mapping (26 passed) |
| Refactor/removal | `f693872` refactor: remove old pencil/modal branding editor | full suite stayed green (see below) |
| RED (full-bleed layout) | `5564b1e` test: admin layout must render branding studio route full-bleed | `npx jest tests/unit/components/admin/admin-layout-client.test.tsx` → 1 failed (sidebar rendered on /admin/branding) |
| GREEN (full-bleed layout) | `d238bcc` fix: render branding studio full-bleed, bypass admin sidebar chrome | same command → 2 passed; verified live at localhost:3000 (sidebar no longer bleeds through the studio) |

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | The 8 editor surfaces exist in rail order with sections/fields; ids are unique real tenant columns | `tests/unit/lib/branding-registry.test.ts` (structure suite) | unit | PASS |
| 2 | Cascade resolves draft → tenant column → inherit chain → default; empty draft string = cleared; multi-hop inheritance works (cart button → cart accent → button primary) | same (resolveFieldValue suite) | unit | PASS |
| 3 | Inherit labels name the nearest set ancestor, else "Default" | same | unit | PASS |
| 4 | Publish payload merges saved + draft, always carries required `primary_color`/`secondary_color`, passes `''` through to clear columns, drops unknown keys, and maps mobile `'inherit'` → `null` | same (buildPublishPayload suite) | unit | PASS |
| 5 | Presets and generate-from-logo emit only known registry color columns as valid hex | same (presets suite) | unit | PASS |
| 6 | Preview bridge only activates with `?brandingPreview=1`, accepts same-origin draft messages only, rejects cross-origin/malformed data, merges drafts over tenant minus `__meta` keys | `tests/unit/hooks/use-branding-preview.test.tsx` | unit | PASS |
| 7 | Storefront search bar renders no admin pencil | `tests/unit/components/customer/search-bar.test.tsx` | unit | PASS (updated) |
| 8 | Admin layout skips sidebar/container chrome on `/admin/branding` (studio owns the viewport) but keeps it on other admin routes | `tests/unit/components/admin/admin-layout-client.test.tsx` | unit | PASS |

## Validation commands actually run

```bash
npx jest                                   # 77 suites / 1114 tests — all passing
npx tsc --noEmit                           # 0 errors outside tests/ (pre-existing test-file errors remain)
npx eslint <all changed files>             # 0 errors, 0 warnings
npx jest ... --coverage                    # branding-registry.ts 99.6% stmts / use-branding-preview.ts 97.5%
```

## Coverage & known gaps

- New logic modules exceed the 80% floor (99%+ statements, 100% functions).
- The Branding Studio UI shell (`branding-studio.tsx`, `field-row.tsx`, `preview-frame.tsx`) has no dedicated component tests — it is presentation over the fully-tested registry/cascade. Follow-up: RTL smoke test + Playwright E2E (open studio → change color → assert preview postMessage → publish).
- Upsell interstitial preview shows checkout-page colors; the interstitial itself still requires the real cart→checkout flow to appear (not force-opened in preview).
- Pre-existing TS errors in `tests/product-detail-*.test.tsx` etc. (missing new `BrandingColors` knobs) predate this work.

## Merge evidence (if squashed)

RED observed for registry, bridge, and inherit-mapping specs before each implementation; GREEN verified per-commit and with the full 1114-test suite after the old editor's removal.
