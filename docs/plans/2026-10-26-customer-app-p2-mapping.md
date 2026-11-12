All paths are relative to `/Users/codemedavid/Documents/whitelabel/.claude/worktrees/customer-app/`.

# Mapping spec: web storefront data → `src/lib/app-contract`

## 1. Menu items → `appMenuItemSchema` (catalog.ts:34)

**Source.** Use `getStorefrontMenu(slug)` (`src/lib/storefront/storefront-menu.ts:92`). It is a cached wrapper around `loadStorefrontCatalog` (`src/lib/storefront/storefront-catalog.ts:87`), which selects `MENU_ITEM_LIST_SELECT` (`src/lib/queries/menu-item-select.ts:35`). It pages past the 1000-row cap, orders by `order, id`, and deliberately keeps `is_available=false` rows (line 67). Categories come from the same call, filtered to `is_active` and ordered by `order`.

| Contract field | Source |
|---|---|
| id, categoryId, name | `id`, `category_id`, `name` |
| description | `description`. Typed as a string but can be null, so use `?? ''` |
| price | `getEffectiveItemPrice(item)` (`src/lib/cart-utils.ts:18`). The sale price only counts when it is >0 and below `price` |
| compareAtPrice | `item.price` when the effective price is below it, otherwise null |
| imageUrl | `image_url`. Typed as a string but may be `''` or http. Return null unless it is https |
| badge | `badge_text`, truncated to 24 chars. The web only renders it when `tenant.menu_engineering_enabled` (`storefront-card.tsx:65`), so gate it the same way |
| isAvailable | `isMenuItemOrderable(item)` (`src/lib/menu-item-availability.ts:30`): `is_available !== false` |
| isFeatured | `is_featured === true`. The web shows ⭐ only when there is no badge |
| modifierGroups | see below |

**Modifier groups.** Reuse `normalizeModifierGroups(item)` (`src/lib/modifier-groups.ts:41`). It gives precedence to `modifier_groups`, then `variation_types` (lines 74–91: `min = is_required?1:0`, `max = 1`), then legacy flat `variations` (lines 93–108: id `legacy-variations`, min 0, max 1), plus `addons` (lines 110–127: id `legacy-addons`, `selection_mode: 'quantity'`, min 0, max null). Groups and options come back sorted by `display_order`.

Per option, map:
- `priceDelta` ← `price_modifier`
- `isDefault` ← `is_default === true`
- `isAvailable` ← `isOptionAvailable(o)` (`modifier-groups.ts:239`)
- `imageUrl` ← `image_url` (https only)

`selectionMode` ← `group.selection_mode ?? 'choice'`.

**Gotchas for modifier groups:**
- **Tenant flag gating.** The web only uses the unified `modifier_groups` path when `tenant.modifier_groups_enabled && item.modifier_groups.length > 0` (`src/components/customer/product-detail-content.tsx:271`). Otherwise it renders the legacy columns through `useVariationState` (`src/hooks/useVariationState.ts`). To match the web, call `normalizeModifierGroups({ variation_types, variations, addons })` without `modifier_groups` when the flag is off. There is no `modifier-groups-flag.ts` file; the flag is read inline.
- **Category default add-ons.** The legacy path merges `category.default_addons` into the item's add-ons, and the item wins on a case-insensitive name clash (`useVariationState.ts:33-42`). `normalizeModifierGroups` does not do this. The catalog's categories query selects `*`, so the data is there; merge before normalising.
- **Linked options.** An option can carry `menu_item_id` (a live link to another menu item). Call `collectLinkedItemIds` and then `resolveLinkedOptions(groups, Map)` (`src/lib/modifier-linked-options.ts:37,92`). The linked items are already in the paged catalog, so build the map from `menuItems`. A missing link resolves to the name "Unavailable item" with `is_available: false`.
- **Negative deltas.** Price modifiers can be negative (e.g. "No rice −₱10"; see `src/lib/order-line-modifier-pricing.ts` header), but `pesoAmountSchema` rejects negatives. You need a decision: drop the option, clamp to 0, or relax the schema.
- **Default selection.** Legacy flat variations get min 0, but the web preselects the first one when nothing is marked default (`useVariationState.ts:70`). `getDefaultSelection` (`src/lib/modifier-groups-cart.ts:86`) only auto-picks for min>0. The contract's `isDefault` will not carry that "first wins" behaviour.
- **Recipe stock.** Sold-out status from recipe stock (`withRecipeStockAvailability`, `src/lib/inventory/option-availability.ts:33`) needs `/api/inventory/ceilings`. It is out of scope for a static catalog and is best-effort available, as on the web.
- **Not in the contract:** presell (`presell_enabled`), bundles (`catalog.bundles`), and `is_upgrade_target`.

## 2. Per-branch menu

`outlet_menu_items` is loaded for the whole tenant when multi-branch is on (`storefront-catalog.ts:113`, `OUTLET_MENU_OVERRIDE_SELECT` at `src/lib/outlets/outlet-menu-repository.ts:27`). Resolve it with `buildOutletMenuIndex`, then `resolveMenuForOutlet(items, index, outletId)` (`src/lib/outlets/outlet-menu-overrides.ts:75,146`):
- `is_listed=false` drops the item.
- `price: null` inherits the store price; 0 is a real free price.
- `discount_cleared` removes the sale price.
- `is_available` is ANDed with the store-wide value.

On the web, the client hook `useBranchPricing` (`src/hooks/use-branch-pricing.ts`) applies this. For the app, I recommend `?outletId=` on `/catalog` resolved server-side: apply the overrides before computing price and compareAtPrice. The contract has no override shape.

**Failure handling.** The catalog carries `outletsFailed` and `overridesFailed`, and `hasCatalogFailure` (line 46) blocks ordering on the web. The contract has no field for this; consider returning `unavailable`.

## 3. Order types → `appOrderTypeSchema`

- **Table:** `order_types`. The type is at `src/types/database.ts:822`.
- **Read:** `readOrderTypes` in `src/lib/checkout/load-checkout-config.ts:31` filters `is_enabled=true AND available_on_web=true` and orders by `order_index`. Whole loader: `loadCheckoutConfig(tenant)` at line 116. It is uncached and throws `CheckoutConfigLoadError`.
- **Customer-facing vs POS-only:** `available_on_web` means web and the customer app; `available_on_pos` is the register. The helper is `isOrderTypeOrderableOnWeb` (`src/lib/order-types/order-type-availability.ts:18`).
- **kind** ← `type`. It is the same enum: `src/lib/order-types/order-type-kinds.ts:14` matches `APP_ORDER_KINDS`. Use `isOrderTypeKind` to guard legacy values.
- **minimumOrder** ← `minimum_order_amount`, in pesos (0 means none). It can arrive as a string (`src/lib/checkout/checkout-order-type.ts:32`), so coerce with `Number()`.
- **Not in the contract:** service charge, advance-order settings, `messenger_enabled`, `after_billing_payment_enabled`, customer form fields, and `note`/`description`.

## 4. Outlets → `appOutletSchema`

Use `OUTLET_SELECT` (`src/lib/outlets/outlet-repository.ts:31`). The `Outlet` type is at `src/types/database.ts:996`. Load only when `isMultiBranchEnabled(tenant)` (`src/lib/outlets/multi-branch-flag.ts:30`, which is `multi_branch_enabled === true`), filtered `is_active` and ordered by `sort_order`.

Fields map 1:1: id, name, address, image_url (https only), latitude, longitude, supports_pickup, supports_delivery, supports_dine_in.

For a single-location tenant, `outlets` is `[]`. There is no synthetic outlet; `tenants.restaurant_address`, `restaurant_latitude` and `restaurant_longitude` exist if you want one.

**Not in the contract:** `operating_hours` and `timezone` per outlet, phone, slug, `delivery_radius_km`. `resolveAvailableModes` (`src/lib/outlets/outlet-modes.ts:41`) gives the modes across outlets.

## 5. Payment methods → `appPaymentMethodSchema`

- **Tables:** `payment_methods` (`src/types/database.ts:883`) and the join table `payment_method_order_types`.
- **Read:** `readPaymentMethods` (`load-checkout-config.ts:53`): `is_active`, ordered by `order_index`, with the order-type links embedded. Grouping helpers are `groupPaymentMethodsByOrderType` and `paymentMethodsForOrderType` (`src/lib/checkout/checkout-config.ts:62,87`).
- **instructions** ← `details`, truncated to 500 chars.
- **requiresProof** ← `isPaymentProofRequired` (`src/lib/payment-proof.ts:32`).
- **Availability is per order type.** A method shows only for the order types it is linked to. The contract has no `orderTypeIds`; add it, or the app will show methods checkout refuses.
- **kind has no source column.** There is no online gateway anywhere in `src`: no PayMongo, and `tenant_secrets` holds only Lalamove, Messenger, Convex and Loyverse keys (`src/lib/tenant-secrets.ts:28`). `skip_payment_details` is described as "cash and the like" (`payment-details-step.ts`), so a heuristic would be `skip_payment_details && !require_payment_proof` → `cash`, otherwise `manual`. The code comment says nothing should be inferred from the method's name. `online` never occurs, so `features.onlinePayments` is always false.
- **Not in the contract:** `qr_code_url`.

## 6. Theme

Run `getTenantBranding(tenant)` (`src/lib/branding-utils.ts:197`). It resolves explicit column, then `storefront_palette` preset, then default.

Suggested role mapping:

| Role | Source |
|---|---|
| primary | `buttonPrimary` (button_primary → primary → palette accent) |
| onPrimary | `buttonPrimaryText`, passed through `readableTextOn(text, bg)` (`src/lib/color-contrast.ts:51`, WCAG 4.5) |
| accent | `accent` (brand_color → accent_color → palette) |
| onAccent | `readableTextOn` or `getContrastColor` (branding-utils.ts:457) |
| primarySoft | `mixHex(primary, background, 0.85)` (color-contrast.ts:65) |
| onPrimarySoft | `readableTextOn(primary, primarySoft)` |
| background | `background` |
| surface | `cards` |
| surfaceMuted | `buttonSecondary`, or a mix of surface toward text |
| text | `textPrimary` |
| textMuted | `textSecondary` |
| border | `border` |
| success / warning / danger | `success` / `warning` / `error` |

**Gotcha:** columns may hold `#RGB`, `rgba()` or other CSS colours (`isValidHexColor` accepts 3 digits). Normalise to `#RRGGBB` and fall back to `DEFAULT_BRANDING` when a value can't be parsed. Also, `DEFAULT_BRANDING.primary` is `#111111`.

**Fonts.** The `font_pair` values are 'theme', 'elegant serif', 'bold display', 'modern sans' and 'warm editorial' (`src/lib/storefront-theme.ts:13,88`). Their typefaces (Cormorant, Anton, Archivo, Lora, Karla) don't overlap the app's keys, so this has to be a judgement mapping. Suggestion: elegant serif → fraunces, warm editorial → fraunces or nunito, bold display and modern sans → poppins or inter, theme or unset → jakarta.

**corners** ← `card_roundness` ('sharp' | 'soft' | 'round' | 'theme'; `ROUNDNESS_PRESETS` at storefront-theme.ts:197). 'theme' or unset → 'soft'.

**logoUrl** ← `logo_url`, https only, otherwise null.

## 7. Banners

`StoredBanner` (`src/lib/banner-list.ts:13`) is `{id, imageUrl, title?, description?, format?}`. Parse with `normalizeBannerList(raw)` (line 38). Two columns hold banners (line 22):
- **Menu banners:** `tenants.promotion_banners`, visible only when `is_promotion_visible` is true (all `src/components/customer/layouts/layout-*.tsx`, e.g. layout-default.tsx:43). They have no format, so use landscape.
- **Welcome banners:** `welcome_page_banners`, which carry `format`.

Map `description` to `subtitle` (140 chars) and `title` to 80 chars. Filter out non-https image URLs and cap at 10. There is no stored tap target, so `action` is always `none`.

Other copy sources: `announcement_text` plus `is_announcement_visible` can feed the `announcement` block; `hero_title` and `header_tagline` can feed `copy.greeting`.

## 8. Feature flags

| Contract | Source |
|---|---|
| ordering | `!getStoreOpenStatus(tenant, now).isOrderingBlocked` (`src/lib/store-open-status.ts:204`; covers `is_prelaunch` and `enforce_operating_hours`). It is time-dependent, so don't cache it long |
| loyalty | `isLoyaltyLive(tenant)` (`src/lib/loyalty/tenant-flags.ts:29`; enabled and not shadow). **`TENANT_STOREFRONT_SELECT` does not select `loyalty_enabled` or `loyalty_shadow`**, so you need an extra column read |
| onlinePayments | always false (no source) |
| multiBranch | `isMultiBranchEnabled` (or `shouldPromptOutletSelection`, line 44, if it needs two or more active outlets) |
| orderModes | `modesFromOrderTypes(orderTypes)` (`src/lib/welcome-builder/modes.ts:21`), intersected with `resolveAvailableModes(outlets)` when multi-branch |

`app_enabled` exists on `tenants` (`database.ts:329`) but is not in the storefront select either. Operating hours are not in the contract.

## 9. Pairings

Merchant-created pairings live in `upsell_pairs` with `pair_type='complementary'` and `is_active` (public RLS: "Public can view active upsell pairs", `supabase/migrations/20260207000001_menu_engineering.sql:101`). Select `source_item_id, target_item_id, display_order`, group by source, sort by `display_order`, and slice to 6. `groupPairings` (`src/lib/boost/pairing-groups.ts:49`) shows the ordering.

The web's `getComplementaryItems` (`src/lib/complementary-pairs-service.ts:13`) uses the service-role client and tiers: upsell_pairs, then item-level `complementary_pairs`, then pairing rules, then category-level pairs, max 4, available targets only. Keep only targets that are listed and available in the projected item set.

## 10. Tenant read and clients

- **Use** `getStorefrontTenant(slug)` (`src/lib/storefront/storefront-tenant.ts:44`). It uses `createPublicClient` (anon key, no cookies, timed fetch, `PUBLIC_QUERY_TIMEOUT_MS=8000`; `src/lib/supabase/public.ts:25,43`) with `TENANT_STOREFRONT_SELECT`, cached with tag `storefrontTag(slug)` for 300s. If the column projection is rejected it falls back to `*` and strips secrets with `omitTenantSecrets` (`src/lib/tenant-public.ts:31`).
- **There is no by-id equivalent.** `getCachedTenantById` (`src/lib/cache.ts:67`) uses the cookie client and `select('*')`, so avoid it. Key the app routes by slug.
- **Service role** is only needed for `tenant_secrets`; nothing here needs it.
- **Catalog version:** take a hash of the projected payload; there is no `updated_at` aggregate.

## 11. Route patterns

`checkRateLimit(key, { limit, windowSec, onRedisFailure: 'instance' })` with `getClientIP` (`src/lib/rate-limit.ts:95`), returning 429 with a `Retry-After` header. Models to copy: `src/app/api/loyalty/progress/route.ts:37-47` and `src/app/api/maps/token/route.ts`.

For Sentry, `src/app/api/inventory/recipe/route.ts:64-75` wraps `Sentry.captureException(error, { tags: { area, tenantId } })` in try/catch, and only for 500s. Responses should use the envelope in `src/lib/app-contract/envelope.ts`.

## 12. Test fixtures

- `tests/fixtures/app-contract.ts`: `VALID_CONFIG` and `VALID_CATALOG` (line 167) are the expected output shapes.
- `tests/fixtures/menu-item.fixture.ts`: `createTestMenuItem`, `createTestVariation`, `createTestAddon`, `createTestVariationOption`.
- `tests/fixtures/fixtures.ts`: `TENANT_FIXTURE`, `ORDER_TYPES_FIXTURE`, and the variations/add-ons fixtures.
- `tests/fixtures/fake-supabase-tables.ts`: `fakeSupabaseTables`, a fake client that enforces the 1000-row cap. `CatalogQueryClient` is injectable for tests.

## Contract fields with no web source

- `paymentMethod.kind` (`online` especially) and `features.onlinePayments`.
- `fontKey`: needs a judgement mapping.
- `primarySoft`, `onPrimarySoft`, `surfaceMuted`: have to be derived.
- `category.imageUrl`: categories only have `icon` and `icon_color`, so it is null.
- `banner.action`.
- `home.blocks`, `quickActions`, `featuredItems.source: 'manual'`, and `copy.guestJoin*`: no stored layout, so they need server defaults.

The reverse gaps (web data the contract can't carry) are listed per section: per-order-type payment links, negative modifier prices, presell, bundles, and branch-failure state.