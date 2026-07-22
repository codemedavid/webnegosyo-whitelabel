# TDD Evidence — MCP tool to set an existing menu item's image

## Source plan

Journeys derived during this TDD run from the request: the WebNegosyo MCP
connector had no tool for uploading files or updating an existing menu item's
image (specifically, images were ready for **Biscoff Frappe** and **Strawberry
Soda** but could only be attached manually in the admin dashboard).

The MCP cannot transport binary files, so the solution is a tool that points an
existing item at an **already-hosted image URL**, plus a read tool so the model
can resolve an item's id by name first.

## User journeys

- As a superadmin operating via the MCP, I want to list a tenant's menu items
  (id, name, image_url) so I can find "Biscoff Frappe" / "Strawberry Soda" by
  name.
- As a superadmin operating via the MCP, I want to set an existing menu item's
  image to a hosted URL without replacing any of its other fields.
- As the platform, I want the image tool to reject a value that is not a valid
  URL before it reaches the database.

## Task report

| Task | Summary | Validation command | Result |
|------|---------|---------------------|--------|
| Add `update_menu_item_image` + `list_menu_items` ops | New ops dispatch to ctx-aware `updateMenuItemImage` / `listMenuItemsForProvisioning`; image op validates `imageUrl` as a URL and `itemId`/`tenantId` as UUIDs | `npx jest --testPathPatterns="provisioning-ops"` | RED then GREEN (17 passed) |
| Partial image write in service layer | `updateMenuItemImage` updates only `image_url`, honoring service-role `ctx` (skips `verifyTenantAdmin`) | `npx tsc --noEmit`, `npx eslint` | PASS (no errors) |

### RED evidence

```
● executeOp dispatch › list_menu_items ... — Unknown op: list_menu_items
● executeOp dispatch › update_menu_item_image ... — Unknown op: update_menu_item_image
Tests: 3 failed, 14 passed, 17 total
```

### GREEN evidence

```
Tests: 17 passed, 17 total
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Registry advertises `list_menu_items` and `update_menu_item_image` | `provisioning-ops.test.ts:exposes a stable, non-empty list of named ops` | unit | PASS |
| 2 | `list_menu_items` forwards tenantId + ctx to the service | `provisioning-ops.test.ts:list_menu_items routes to listMenuItemsForProvisioning` | unit | PASS |
| 3 | `update_menu_item_image` forwards (itemId, tenantId, imageUrl, ctx) | `provisioning-ops.test.ts:update_menu_item_image sets the image_url` | unit | PASS |
| 4 | Non-URL image value is rejected before hitting the service | `provisioning-ops.test.ts:update_menu_item_image rejects a non-URL image value` | unit | PASS |
| 5 | Both ops advertise a non-empty object schema (model can pass fields) | `provisioning-ops.test.ts:every op advertises an object schema` | unit | PASS |

## Coverage and known gaps

- Full suite: `Tests: 1772 passed, 3 failed` — the 3 failures are in
  `webnegosyo-app/lib/{printer-native-load,order-item-images}.test.ts`,
  confirmed pre-existing (fail identically with changes stashed) and unrelated
  to this work.
- Gap: the service functions themselves (`updateMenuItemImage`,
  `listMenuItemsForProvisioning`) are mocked at the ops boundary and not
  exercised against a live Supabase client; they mirror the existing
  ctx-aware `createMenuItem` pattern.
