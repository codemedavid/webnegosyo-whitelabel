# TDD evidence — MCP menu-item image ingestion (ImageKit) + category reads

**Date:** 2026-07-25
**Branch:** `feat/unified-modifier-groups`
**Source plan:** none — journeys derived during this TDD run from a reported MCP
failure (an AI client working on the *Lucky Joy Official* tenant could not attach
food photos held in a Google Drive folder).

## Problem

The SmartMenu MCP already exposed `update_menu_item`, `update_menu_item_image`
(hosted URL only) and `upload_menu_item_image` (raw base64). Neither covers the
common case: the operator hands the AI a **link** to the photos.

- `update_menu_item_image` stores the foreign URL verbatim. A Google Drive share
  link (`/file/d/<id>/view`) serves an HTML page, not an image, so the menu ends
  up advertising a broken image; even a valid third-party URL rots later.
- `upload_menu_item_image` needs image bytes, which a hosted connector
  (Claude/ChatGPT) generally cannot produce from a Drive folder.
- There was no read for categories, so `category_id` (needed by `add_menu_item`
  and to move an item) could not be resolved by name.

## User journeys

1. As an operator, I want to give the AI a link to a food photo (Drive, Dropbox,
   or a plain image URL) and have it land on the right menu item, so I don't have
   to upload images by hand.
2. As the platform, I want every menu image served from our own ImageKit CDN, so
   a menu never depends on a third party's share link staying alive.
3. As an operator, I want a failed image link to leave the item unchanged, so a
   bad link never replaces a working photo with a broken one.
4. As the AI, I want to list a tenant's categories, so I can resolve `category_id`
   by name instead of guessing when adding or moving items.
5. As the platform, I want the server to refuse to fetch internal addresses, so a
   caller-supplied URL cannot be used to read cloud metadata (SSRF).

## Task report

| Task | Summary | Validation command | RED | GREEN |
|------|---------|--------------------|-----|-------|
| Remote fetch module | New `src/lib/imagekit-remote.ts`: share-link normalization, SSRF guard, content-type/size validation, base64 result | `npx jest --config jest.config.cjs --testPathPatterns="imagekit-remote-fetch"` | `Cannot find module '@/lib/imagekit-remote'` | PASS (18 tests) |
| Service writer | New `setMenuItemImageFromUrl` in `admin-service.ts`: fetch → ImageKit → `image_url`; row untouched on failure | `... --testPathPatterns="menu-item-image-ingest"` | `setMenuItemImageFromUrl is not a function` | PASS (4 tests) |
| Ops registration | New ops `import_menu_item_image_from_url` and `list_categories`; `list_menu_items` now returns `description` | `... --testPathPatterns="provisioning-ops"` | `Unknown op: import_menu_item_image_from_url` / `Unknown op: list_categories` | PASS (38 tests) |

RED evidence (commit `a291098`): `Test Suites: 3 failed, 3 total / Tests: 28
failed, 21 passed, 49 total`.

GREEN evidence (commit `5780038`), whole MCP/ImageKit surface re-run:
`Test Suites: 16 passed, 16 total / Tests: 160 passed, 160 total`.

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|--------------------|-----------|------|--------|
| 1 | A Google Drive `/file/d/<id>/view` link is rewritten to its direct-download form | `tests/unit/imagekit-remote-fetch.test.ts` | unit | PASS |
| 2 | A Google Drive `open?id=` link is rewritten to its direct-download form | same | unit | PASS |
| 3 | A Dropbox `?dl=0` share link is rewritten to `?raw=1` | same | unit | PASS |
| 4 | An ordinary CDN URL is passed through untouched | same | unit | PASS |
| 5 | Non-http(s) schemes (`file:`, `ftp:`) are refused | same | unit | PASS |
| 6 | Loopback, private (10/172.16-31/192.168), link-local (169.254.x) and IPv6 loopback hosts are refused | same | unit | PASS |
| 7 | A private-network URL is refused *before* any network call is made | same | unit | PASS |
| 8 | A successful fetch returns base64 bytes, content type and a file name derived from the URL | same | unit | PASS |
| 9 | An explicit `fileName` hint wins over the URL basename (preserves codes like `D1-…`) | same | unit | PASS |
| 10 | A URL with no basename falls back to a content-type derived name | same | unit | PASS |
| 11 | A `text/html` response (the Drive interstitial) is rejected as "not an image" | same | unit | PASS |
| 12 | A non-2xx response is rejected with its status | same | unit | PASS |
| 13 | An empty body is rejected | same | unit | PASS |
| 14 | A body over `MAX_REMOTE_IMAGE_BYTES` (10 MB) is rejected | same | unit | PASS |
| 15 | `setMenuItemImageFromUrl` re-hosts the bytes on ImageKit under `menu-items/<tenantId>` and stores the ImageKit URL | `tests/unit/menu-item-image-ingest.test.ts` | unit | PASS |
| 16 | The `fileName` hint reaches the fetch layer | same | unit | PASS |
| 17 | The `menu_items` row is never written when the remote fetch fails | same | unit | PASS |
| 18 | The `menu_items` row is never written when the ImageKit upload fails | same | unit | PASS |
| 19 | `import_menu_item_image_from_url` dispatches `(itemId, tenantId, sourceUrl, fileName, ctx)` to the writer | `tests/unit/provisioning-ops.test.ts` | integration (ops registry) | PASS |
| 20 | The op works without a `fileName` hint | same | integration | PASS |
| 21 | The op rejects a non-URL `sourceUrl` before touching the writer | same | integration | PASS |
| 22 | `list_categories` routes to `listCategoriesForProvisioning` with tenantId + service-role ctx | same | integration | PASS |
| 23 | Every op (including both new ones) still advertises a non-empty MCP JSON schema | same | integration | PASS |
| 24 | No destructive op name entered the registry (import-time fail-closed) | `tests/unit/mcp-op-safety.test.ts` | unit | PASS |

## Coverage

```
npx jest --config jest.config.cjs --coverage \
  --collectCoverageFrom='src/lib/imagekit-remote.ts' \
  --collectCoverageFrom='src/lib/mcp/provisioning-ops.ts' \
  --testPathPatterns="imagekit-remote-fetch|menu-item-image-ingest|provisioning-ops"

File                  | % Stmts | % Branch | % Funcs | % Lines
imagekit-remote.ts    |   95.58 |    83.58 |     100 |   95.58
provisioning-ops.ts   |   95.48 |    90.90 |   72.72 |   95.48
```

Both above the 80% threshold. Uncovered lines in `imagekit-remote.ts` are the
malformed-octet and malformed-URL early returns inside the IP-range helpers,
reached only through inputs the public `assertPublicHttpUrl` already rejects.

## Known gaps

- **Not verified end to end against a live ImageKit account.** All ImageKit and
  Supabase calls are mocked at the unit boundary. The first real Drive link
  should be tried against a staging tenant.
- **Requires a deploy to reach connectors.** The ops list is served by
  `www.webnegosyo.com/api/mcp/mcp`; the two new tools appear only after the
  Next.js app is deployed.
- **Drive sharing is the operator's responsibility.** A Drive file that is not
  "Anyone with the link" returns the HTML sign-in page; the op fails with a
  "not an image" message rather than guessing.
- **No batch op.** Setting 40 images means 40 calls. Deliberate (YAGNI): a batch
  op would need partial-failure semantics; add one only if call volume hurts.
- **Pre-existing unrelated failures** in the full suite:
  `webnegosyo-app/lib/printer-native-load.test.ts` and
  `webnegosyo-app/lib/order-item-images.test.ts` (a `jest.mock` hoisting
  `ReferenceError`). Untouched by this change.

## Merge evidence

RED `a291098` → GREEN `5780038`. No refactor commit: the implementation was
written once against the failing tests and needed no restructuring.
