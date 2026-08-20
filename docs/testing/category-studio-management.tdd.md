# TDD Evidence — Branding Studio Category Management + Per-Category Card Templates

**Branch**: `category-studio-management`
**Source plan**: inline `/ecc:plan` output (this session, 2026-08-25); user confirmed with "proceed". No `*.plan.md` artifact.

## User journeys

1. As a merchant, I want to rearrange my menu categories inside the Branding Studio and see the storefront preview update instantly, so I can design the menu layout before publishing.
2. As a merchant, I want to set a category to horizontal scroll and give it its own card template (e.g. Burgers → top row, storefront card), so featured categories look different from the rest of the menu.
3. As a customer, I see each category rendered with its configured layout and card template; categories without an override keep the store-wide template.

## Task report

| Task | Summary | Validation | RED evidence | GREEN evidence |
|---|---|---|---|---|
| Per-category template resolver | `src/lib/category-card-template.ts` resolves category override → tenant template → `classic` default, rejecting unknown ids | `npx jest tests/unit/category-card-template.test.ts` | Module-not-found (compile-time RED, commit `a6f5cfa`) | PASS (commit `9d37fd3`) |
| Category draft apply/publish logic | `src/lib/category-studio.ts` — `applyCategoryDraft` (reorder + field overrides, immutable) and `buildCategoryPublishPlan` (reorder ids + full `CategoryInput` updates, no-op filtering) | `npx jest tests/unit/category-studio-draft.test.ts` | Module-not-found | PASS |
| Studio surface registration | `categories` ("Menu Layout") surface added to `BRANDING_SURFACES`; previews `/menu` | `npx jest tests/unit/branding-categories-surface.test.ts` | `expect(surface).toBeDefined()` failed | PASS |
| Grouped menu honors overrides | `MenuGridGrouped` resolves the template per category for both grid and horizontal-scroll sections | `npx jest tests/unit/menu-grid-grouped-category-template.test.tsx` | Runtime RED: rendered `data-template="classic"` where `storefront`/`neon` expected | PASS |
| Studio panel + preview bridge + publish | `CategoryLayoutPanel` (dnd-kit), draft streamed as `__categoryDraft` via `preview-frame.tsx`, applied in `menu-client.tsx`, published via `reorderCategoriesAction` + `updateCategoryAction` | full suite + `npm run build` | — (integration wiring; covered by the pure-logic suites above) | Suite + build PASS (commit `5ac715f`) |
| DB migration | `20260825120000_category_card_template.sql` — nullable `categories.card_template` | Supabase MCP `apply_migration` + probe | — | Applied 2026-08-19; probe returned `card_template / text / null` |

RED run (all four suites, before implementation): `Test Suites: 4 failed — Cannot find module '@/lib/category-card-template'`, `Cannot find module '@/lib/category-studio'`, surface undefined, and `data-template="classic"` mismatches.

GREEN run: `Tests: 24 passed` on the four new suites; full suite `Test Suites: 499 passed, 1 skipped · Tests: 5993 passed, 8 skipped`.

Two pre-existing structural tests in `tests/unit/lib/branding-registry.test.ts` encoded the old nine-surface roster; updated to the new ten-surface spec (the `categories` surface is a custom panel and legitimately has zero registry sections).

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Category `card_template` override wins when it is a known template id | `category-card-template.test.ts` | unit | PASS |
| 2 | Null/unknown overrides fall back to tenant template, then `classic` | `category-card-template.test.ts` | unit | PASS |
| 3 | `applyCategoryDraft` reorders per draft, keeps unlisted categories in saved order, ignores unknown ids, never mutates input | `category-studio-draft.test.ts` | unit | PASS |
| 4 | Empty-string card_template override clears back to inherit (null) | `category-studio-draft.test.ts` | unit | PASS |
| 5 | Publish plan sends reorder only when order actually changed; updates carry FULL `CategoryInput` so schema defaults can't clobber saved columns; no-op overrides are skipped | `category-studio-draft.test.ts` | unit | PASS |
| 6 | "Menu Layout" surface is registered and previews the menu route | `branding-categories-surface.test.ts` | unit | PASS |
| 7 | Grouped menu renders each category (grid + horizontal) with its own resolved template | `menu-grid-grouped-category-template.test.tsx` | component | PASS |

## Coverage

`npx jest <4 new suites> --coverage` on the touched logic:
`category-card-template.ts` 100% · `category-studio.ts` 100% lines / 89.7% branch · `menu-grid-grouped.tsx` 93.2% lines. All ≥80% target.

## Known gaps

- The Studio panel (`category-layout-panel.tsx`) and `branding-studio.tsx` publish flow are exercised through the pure helpers, not a full RTL drag-and-drop test (dnd-kit drag simulation is out of scope for jsdom; the identical pattern in `categories-list.tsx` is likewise untested).
- Publish is sequential (reorder, then N updates) with stop-on-first-failure; a partial failure leaves the draft intact for retry — by design, documented in the plan risks.
- Non-default layouts (list/mosaic/magazine) still render the tenant-wide template; the grouped default layout (used by ~all tenants' menu home) honors the per-category override.

## Merge evidence

Checkpoints on `category-studio-management`: `a6f5cfa` (RED reproducers) → `9d37fd3` (core logic GREEN) → `5ac715f` (studio wiring + migration). If squash-merged, this file preserves the RED/GREEN trail.
