# TDD Evidence — Reusable Add-on Library

**Source plan:** inline `/ecc:plan` (snapshot-on-attach + flat list, confirmed by user).
**Feature:** Tenant-scoped add-on library so merchants define an add-on once and attach snapshots to many menu items, instead of retyping per item. An entry can be manual or sourced from a menu item, each with its own cost.

## User journeys
1. As a merchant, I want to define an add-on once and reuse it, so I don't retype name/price on every item.
2. As a merchant, I want a library add-on to be either a manual entry or sourced from an existing menu item, each with its own cost.
3. As a merchant, when I attach library add-ons to an item, duplicates by name should not pile up.

## RED / GREEN
- **RED:** `npx jest --config jest.config.cjs addon-library-service` → suite failed to run: `Cannot find module '@/lib/addon-library-service'` (compile-time RED for the intended missing implementation).
- **GREEN:** after implementing `addon-library-utils.ts` (+ service re-export) → `Tests: 14 passed, 14 total`.
- One intermediate failure was a **test-data** bug (invalid RFC UUID constant), fixed in the test, not the implementation.

## Test specification
| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | Schema accepts a minimal manual entry and defaults optional fields | `tests/unit/addon-library-service.test.ts` | unit | PASS |
| 2 | Schema rejects empty name / negative price; allows zero (free) | same | unit | PASS |
| 3 | Schema accepts valid uuid source_menu_item_id, rejects non-uuid | same | unit | PASS |
| 4 | `libraryEntryToAddon` copies name+price with a fresh id, drops library-only fields | same | unit | PASS |
| 5 | `buildLibraryDraftFromMenuItem` prefills name/price/source, prefers discounted price | same | unit | PASS |
| 6 | `attachEntriesToAddons` appends snapshots, is immutable, dedupes vs existing + within batch (case-insensitive) | same | unit | PASS |

## Validation commands run
- `npx jest --config jest.config.cjs addon-library-service` → 14 passed.
- `npx eslint <changed files>` → clean.
- `npx tsc --noEmit` → no errors in any new/changed file (10 remaining errors are pre-existing, in `tests/product-detail-*` and `tests/unit/api/revalidate-menu.test.ts`, untouched by this work).

## Notes / gaps
- **Jest config:** all tests fail to load `jest.config.ts` under Node 22 (native ESM load of the `.ts` config can't resolve `next/jest`). Added `jest.config.cjs` (CJS mirror) as a working entrypoint; `npm test` still points at the broken `.ts`. Pre-existing environment issue, flagged for follow-up.
- **DB wrappers** (`get/create/update/deleteAddonLibraryEntry`) mirror `admin-service.ts` and are not unit-tested (thin Supabase passthroughs), consistent with existing convention.
- **Migration `20260720120000_addon_library.sql` not yet applied** to the remote project; `src/types/supabase.ts` was hand-updated to match — regenerate types after applying.
