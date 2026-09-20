# MCP: owner accounts, bundle/upsell editing, branding images, category icons

Built 2026-09-19. Plan: `~/.claude/plans/keen-wobbling-raven.md`.

## What changed

| Area | Ops | Backing code |
|---|---|---|
| Owner account | `create_tenant_owner`, `list_tenant_users` (superadmin-only) | `src/lib/tenant-owner-provisioning.ts` — one-owner rule checked BEFORE the auth user exists; auth user deleted if the row insert fails; password returned once |
| Bundles / upsells | `update_bundle`, `set_bundle_image`, `update_upsell_pair` | `bundles-service.ts` (`updateBundleFields`, `toBundleRow`, `setBundleImage`, ctx on `updateBundle`/`toggleBundleActive`, `list_bundles` select FIXED: `fixed_price`/`discount_percent` + slots), `menu-engineering-service.ts` (`updateUpsellPair`, richer list) |
| Branding | `get_branding`, `set_branding_image`, `add_banner`, `update_banner`, `clear_banner`, `list_banners`; `update_branding.tenantSlug` now optional | `src/lib/branding-images.ts` (writes via `saveBrandingAction`), `src/lib/banner-list.ts` (pure array ops), `src/lib/branding-options.ts` (schema enums + Studio selects), `src/lib/image-ingest.ts` + `image-source.ts` (one door for bytes-or-link → ImageKit) |
| Category icons | `list_category_icons`, `update_category`, `set_category_icons`; `add_category` advertises `icon`/`icon_color` | `src/lib/category-icon-catalog.ts` (pure vocabulary; `category-icons.ts` re-exports), `categorySchema` now refuses unknown `lucide:*` names and non-hex colours, `updateCategoryFields`, `list_categories` returns icons |

## Guarantees pinned by tests

- `tests/unit/provisioning-ops.test.ts` — every new op dispatches with the ctx, strips envelope keys, and normalizes to a non-empty advertised schema (SDK `normalizeObjectSchema`). `set_category_icons` validates ALL names before the first write. `update_bundle` without `slots` never calls the slot-replacing writer.
- `tests/unit/mcp-merchant-ops.test.ts` — owner ops are absent from the merchant surface; every other new op is present with `tenantId` stripped.
- `tests/unit/tenant-owner-provisioning.test.ts` — second owner refused before `createUser`; unknown tenant refused; cleanup on row failure (and reported when cleanup fails too).
- `tests/unit/branding-images.test.ts` — no column write when the upload throws; banner add keeps existing banners and flips `is_promotion_visible`; hero warning when the preset/featured product would hide the image.
- `tests/unit/bundles-update.test.ts`, `category-patch-schema.test.ts`, `upsell-pair-update.test.ts` — patch schemas carry NO defaults. **Zod 4 keeps `.default()` values through `.partial()`**, so a derived partial schema silently resets `is_active`/`order`/`display_order`; all three are written out explicitly.
- `tests/unit/category-icon-catalog.test.ts` — the catalog equals the component map's keys (an icon the MCP offers is always renderable on web).
- `tests/unit/banner-list.test.ts`, `image-source.test.ts`, `branding-options.test.ts`.

Full run 2026-09-19: 769 suites / 8349 tests green; new source `tsc` + `eslint` clean.

## Deliberately NOT done

- Server-side image generation. The AI client generates the image and hands bytes (`imageBase64`) or a public link (`sourceUrl`) to the attach ops. If hosted connectors prove unable to pass bytes, an OpenRouter Images API op (`/api/v1/images`, reuses `OPENROUTER_API_KEY`, supports `aspect_ratio`) is the follow-up.
- Expo customer app still renders `lucide:*` as literal text (`mobile/components/menu/category-tabs.tsx`); Studio `category-layout-panel.tsx` prints the raw string.
- Owner invite emails (password-only by decision).

## Live verification (after deploy; connectors cache `tools/list` — remove + re-add)

1. `list_bundles` on a tenant with bundles returns `fixed_price`/`discount_percent` and slots (was a PostgREST 42703 before).
2. `create_tenant_owner` on a scratch tenant → sign in at the returned `loginUrl`.
3. `add_banner surface:menu sourceUrl:<Drive link>` → banner visible on the menu page.
4. `set_branding_image target:hero` + `update_branding { hero_preset: 'split' }` → hero shows the image.
5. `set_category_icons` → icons render on the storefront.
