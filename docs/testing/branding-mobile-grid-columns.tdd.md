# TDD Evidence — Branding Studio mobile grid columns save

## Source plan
No `*.plan.md`; journeys derived during this TDD run from the bug report:
"the grid column edit for mobile is not working … make sure we are able to save it."

## User journeys
- As a merchant, I want to set the mobile menu grid to 1 or 2 columns in the
  Branding Studio and have it persist, so my storefront renders that layout on phones.

## Root cause
`mobile_grid_columns` is registered `mobileOnly: true`, so it only appears on the
mobile device tab. Every mobile-tab edit was routed into the `mobile_overrides`
JSONB map. But `mobile_grid_columns` is a real `tenants` column that the storefront
reads directly (`tenant.mobile_grid_columns` in `menu-client.tsx`), and the menu
never applies `mobile_overrides`. The edit was written to the wrong place and
silently dropped — the grid never changed.

## Fix
- Added a `columnBacked` flag to `BrandingField` and set it on `mobile_grid_columns`.
- Added pure helper `editsTenantColumn(field, isMobile)` — desktop always edits the
  column; on mobile only `columnBacked` fields do, the rest become mobile overrides.
- `branding-studio.tsx` now routes column-backed fields through the desktop
  draft/tenant path on the mobile tab (value, isSet, inherit label, onChange,
  onClear, and the section-dirty dot). Publish then carries `mobile_grid_columns`
  into the tenant payload via `buildPublishPayload`.

## Task report
- Command: `jest --testPathPatterns=branding-mobile-column-routing`
  - RED: 4 failed — `editsTenantColumn` undefined, `columnBacked` unset.
  - GREEN: 4 passed after registry + helper change.
- Command: `jest --testPathPatterns=branding` — 11 suites, 152 tests PASS (no regressions).
- `tsc --noEmit` and `eslint` on changed files: clean.

## Test specification
| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | `mobile_grid_columns` is flagged column-backed | `branding-mobile-column-routing.test.ts` | unit | PASS |
| 2 | Column-backed field edits target the tenant column on both tabs | same | unit | PASS |
| 3 | Ordinary fields become mobile overrides only on the mobile tab | same | unit | PASS |
| 4 | Unflagged fields default to the override path on mobile | same | unit | PASS |

## Known gaps
- Routing unit-tested via the pure `editsTenantColumn` helper; the component wiring
  was verified by reading data flow and typecheck, not a rendered React test.
- The "Reset section" link on mobile still keys off mobile overrides, so a
  grid-columns-only change does not surface that link (Publish is still enabled).
