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
| RED (in-iframe nav bridge) | `498a711` test: preview bridge must survive in-iframe navigation | `npx jest tests/unit/hooks/use-branding-preview.test.tsx` → 1 failed ("stays active after in-preview navigation drops the query param") |
| GREEN (in-iframe nav bridge) | `1995a0b` fix: keep preview bridge alive across in-iframe navigation | same command → 9 passed |

## Unstyled-render defect (2026-07-04)

Symptom: the Studio rendered white-on-white — its arbitrary-value Tailwind classes
(`bg-[#1D1815]`, `w-[84px]`, `text-[14px]`, …) produced no CSS, so the dark rail,
Publish button and 336px panel collapsed. Root cause: a **stale Turbopack dev CSS
chunk** cached under `Cache-Control: immutable` at a stable URL — the server kept
serving pre-Studio CSS after the new classes were added. Fix: clean rebuild
(`rm -rf .next` + restart). Verified: a fresh isolated browser context loads the
studio correctly on first paint (rail `rgb(29,24,21)`, rail 84px, panel 336px) with
no CSS injection. Production (`next build`) content-hashes chunks per build and is
unaffected. No app-code change was needed; the classes generate correctly once the
dev cache is clean.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | The 8 editor surfaces exist in rail order with sections/fields; ids are unique real tenant columns | `tests/unit/lib/branding-registry.test.ts` (structure suite) | unit | PASS |
| 2 | Cascade resolves draft → tenant column → inherit chain → default; empty draft string = cleared; multi-hop inheritance works (cart button → cart accent → button primary) | same (resolveFieldValue suite) | unit | PASS |
| 3 | Inherit labels name the nearest set ancestor, else "Default" | same | unit | PASS |
| 4 | Publish payload merges saved + draft, always carries required `primary_color`/`secondary_color`, passes `''` through to clear columns, drops unknown keys, and maps mobile `'inherit'` → `null` | same (buildPublishPayload suite) | unit | PASS |
| 5 | Presets and generate-from-logo emit only known registry color columns as valid hex | same (presets suite) | unit | PASS |
| 6 | Preview bridge activates with `?brandingPreview=1` **and stays active across in-iframe navigation** (sessionStorage), accepts same-origin draft messages only, rejects cross-origin/malformed data, merges drafts over tenant minus `__meta` keys | `tests/unit/hooks/use-branding-preview.test.tsx` | unit | PASS |
| 7 | Storefront search bar renders no admin pencil | `tests/unit/components/customer/search-bar.test.tsx` | unit | PASS (updated) |
| 8 | Admin layout skips sidebar/container chrome on `/admin/branding` (studio owns the viewport) but keeps it on other admin routes | `tests/unit/components/admin/admin-layout-client.test.tsx` | unit | PASS |

## Validation commands actually run

```bash
npx jest                                   # 78 suites / 1117 tests — all passing
npx tsc --noEmit                           # 0 errors outside tests/ (pre-existing test-file errors remain)
npx eslint <all changed files>             # 0 errors, 0 warnings
```

Live verification this turn used the Chrome DevTools MCP against the running dev
server: draft colors stream into the preview iframe instantly (Cart Background →
green body observed), Reset clears the preview, Publish is disabled when clean and
fires `saveBrandingAction` + shows the "✓ Published" toast when dirty, the mobile
toggle reframes the iframe to ~374px, and the Flash surface forces the flash overlay.

## Coverage & known gaps

- New logic modules exceed the 80% floor (99%+ statements, 100% functions).
- The Branding Studio UI shell (`branding-studio.tsx`, `field-row.tsx`, `preview-frame.tsx`) has no dedicated component tests — it is presentation over the fully-tested registry/cascade. Follow-up: RTL smoke test + Playwright E2E (open studio → change color → assert preview postMessage → publish).
- Upsell interstitial preview shows checkout-page colors; the interstitial itself still requires the real cart→checkout flow to appear (not force-opened in preview).
- Product Detail surface fields map to the `modal_*` tenant columns (quick-view / popup + checkout modal colors, surfaced via `getTenantBranding`). They persist correctly, but the static product/menu preview does not auto-open that modal, so their effect is not visible until the modal opens in the real flow. Full product-page theming still lives in the dedicated Product Detail customizer.
- Pre-existing TS errors in `tests/product-detail-*.test.tsx` etc. (missing new `BrandingColors` knobs) predate this work.

## Merge evidence (if squashed)

RED observed for registry, bridge, and inherit-mapping specs before each implementation; GREEN verified per-commit and with the full 1114-test suite after the old editor's removal.
