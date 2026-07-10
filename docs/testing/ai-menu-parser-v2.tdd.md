# TDD Evidence — AI Menu Parser v2 (image upload, addon groups, appetizing descriptions)

## Source plan

No `*.plan.md` was provided. User journeys were derived during this TDD run from the request:
switch the parser to `google/gemma-4-26b-a4b-it`, support menu **image** upload as an
alternative to text, automatically attach shared add-ons to the right products, always
generate appetizing ("craving") descriptions, and improve the import UI/UX.

## User journeys

1. As a superadmin, I want to upload photos of a merchant's menu (or paste text) so the AI extracts the full structured menu without manual re-typing.
2. As a superadmin, I want shared add-on sections ("Add-ons for all milk teas: Pearls P20…") automatically attached to the right products, so I don't have to copy add-ons onto each item.
3. As a superadmin, I want every parsed item to get a short appetizing description (never a re-list of its variation options), so imported menus look polished immediately.
4. As a superadmin, I want to review and prune the parsed result before importing, so a mis-parse never reaches a live menu.

## Task report

| Task | Summary | Validation command | RED evidence | GREEN evidence |
|---|---|---|---|---|
| Normalization + addon-group pipeline (`src/lib/ai-menu-parser-utils.ts`) | `normalizeParsedMenuData` hardens raw AI output (string prices "₱1,350", missing/dup categories, junk items); `applyAddonGroups` distributes shared add-ons by category/item/`*` with dedupe; `finalizeParsedMenuData` chains normalize→groups→sanitize | `npx jest tests/unit/lib/ai-menu-parser-normalize.test.ts` | 16 tests failed (`finalizeParsedMenuData is not a function`, etc.) — commit `0e4b1a5` | All pass — commit `7939006` |
| Request module (`src/lib/ai-menu-parser-request.ts`) | Model constant `google/gemma-4-26b-a4b-it`, request validation (text ≤50k, ≤3 images, PNG/JPEG/WebP data URLs ≤4MB), multimodal message builder, balanced-brace JSON extraction from prose/fenced output, rewritten system prompt (appetizing descriptions + `addonGroups`/`appliesTo`) | `npx jest tests/unit/lib/ai-menu-parser-request.test.ts` | Suite failed at import (module did not exist) — commit `0e4b1a5` | All pass — commit `7939006` |
| Route rewrite (`src/app/api/ai/parse-menu/route.ts`) | Accepts `{ menuText, images }`, streams from OpenRouter with SSE line-buffering fix, `max_tokens` 1024→8192 (large menus were truncating), 422 when zero items parsed, response runs `finalizeParsedMenuData` | `npx jest tests/unit/api/parse-menu.test.ts` | Pre-existing suite pinned old model/1024 tokens; assertions updated to the new spec (intentional spec change requested by user) | 10/10 pass — commit `616f41e` |
| Import UI rework (`src/components/superadmin/bulk-menu-import.tsx`) | Text/Image tabs, drag-drop + click upload with client-side type/size/count validation, thumbnails with remove, optional notes in image mode, editable preview (per-item remove before import), add-on badges, import count reflects pruned list | `npx jest tests/unit/bulk-menu-import.test.tsx` | 5/7 failed (tabs, image input, remove buttons absent) — commit `843861a` | 7/7 pass — commit `616f41e` |

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | String prices with currency symbols/commas are coerced; invalid/negative → 0 | `ai-menu-parser-normalize.test.ts` | unit | PASS |
| 2 | Nameless items/categories dropped; categories deduped case-insensitively; missing categories appended | `ai-menu-parser-normalize.test.ts` | unit | PASS |
| 3 | Addon groups attach to matching categories/items (case-insensitive), `*` = all, item's own addon price wins on dedupe, input never mutated | `ai-menu-parser-normalize.test.ts` | unit | PASS |
| 4 | Full pipeline: normalize → distribute groups → strip redundant option-list descriptions | `ai-menu-parser-normalize.test.ts` | unit | PASS |
| 5 | Model is `google/gemma-4-26b-a4b-it`; request validation enforces text/image limits and mime allowlist | `ai-menu-parser-request.test.ts` | unit | PASS |
| 6 | Image inputs produce multimodal `image_url` content parts; prompt demands appetizing descriptions + `addonGroups` | `ai-menu-parser-request.test.ts` | unit | PASS |
| 7 | JSON extracted from bare/fenced/prose-wrapped model output; braces inside strings handled; garbage → null | `ai-menu-parser-request.test.ts` | unit | PASS |
| 8 | Route: auth (401/403), validation (400), missing key (500), OpenRouter params, sanitization, fence stripping, error paths | `api/parse-menu.test.ts` | integration | PASS |
| 9 | UI: text/image tabs, parse payload shape per mode, file→data URL, editable preview excludes removed items from import, results summary | `bulk-menu-import.test.tsx` | component | PASS |

## Coverage

`npx jest <parser suites> --coverage` scoped to the changed files:

| File | Stmts | Branch | Lines |
|---|---|---|---|
| All changed files | 94.15% | 85.95% | 94.15% |
| `ai-menu-parser-utils.ts` | 98.46% | 91.34% | 98.46% |
| `ai-menu-parser-request.ts` | 95.63% | 92% | 95.63% |
| `parse-menu/route.ts` | 88.82% | 80.64% | 88.82% |
| `bulk-menu-import.tsx` | 93.16% | 73.68% | 93.16% |

Known gaps (intentional): UI drag-over styling branches and toast-only error paths; route's
OpenRouter network-failure micro-branches. No E2E — parsing depends on a paid external LLM;
covered instead by mocked integration tests at the route boundary.

Unrelated pre-existing failures on this branch (`tests/checkout-*`, `webnegosyo-app/*`) were
verified to come from other uncommitted WIP: with that WIP stashed, `checkout-form-payment-terms`
passes 3/3 with these changes applied.

## Notes / follow-ups

- The model id `google/gemma-4-26b-a4b-it` was specified by the product owner; if OpenRouter
  rejects it at runtime the route surfaces the OpenRouter error and the constant lives in one
  place (`PARSE_MENU_MODEL` in `src/lib/ai-menu-parser-request.ts`).
- Requires `OPENROUTER_API_KEY` (already used by v1).

## Merge evidence (in case of squash)

RED `0e4b1a5` (16 failing pipeline/request tests) → GREEN `7939006`;
RED `843861a` (5/7 failing UI tests) → GREEN `616f41e`; full parser scope re-run: 5 suites, 61 tests, all pass.
