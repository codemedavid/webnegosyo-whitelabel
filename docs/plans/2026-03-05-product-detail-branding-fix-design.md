# Product Detail Page Branding Customization — Bug Fix & Completion

**Date**: 2026-03-05
**Status**: Approved

## Problem Statement

The product detail page branding customization feature has three categories of bugs:

1. **Server errors on save**: The `saveProductDetailSettings` action sends 6 text fields (`variation_required_text`, `variation_optional_text`, `addon_optional_text`, `footer_empty_summary_text`, `buy_now_button_label`, `add_to_cart_button_label`) that don't exist as columns in the `product_detail_settings` database table. PostgREST returns an error when these unknown columns are included in the upsert.

2. **Cache not invalidating after save**: The page uses ISR with `revalidate = 300`. After save, `revalidatePath('/{slug}/menu', 'layout')` doesn't reliably invalidate deeply nested `/menu/item/[itemId]` pages. No client-side refresh happens after save, so users see stale data until the ISR TTL expires or they hard-refresh.

3. **Incomplete customization coverage**: Some visual elements on the product detail page may lack corresponding color pickers in the admin customizer panel.

## Design

### Track 1: Fix Server Errors

**Migration**: Add 6 missing text columns to `product_detail_settings`:
- `variation_required_text` TEXT DEFAULT NULL
- `variation_optional_text` TEXT DEFAULT NULL
- `addon_optional_text` TEXT DEFAULT NULL
- `footer_empty_summary_text` TEXT DEFAULT NULL
- `buy_now_button_label` TEXT DEFAULT NULL
- `add_to_cart_button_label` TEXT DEFAULT NULL

**Safety net**: In `saveProductDetailSettings()`, whitelist known DB columns and strip any unknown fields before upserting. This prevents future field additions in the TypeScript interface from breaking saves before their migration runs.

### Track 2: Fix Cache Invalidation

**Server-side**:
- Use `revalidateTag()` with tenant-specific tags (e.g., `pdp-settings-{tenantId}`) for precise cache invalidation
- Wrap data fetches in `product-detail-data.ts` with `unstable_cache()` using these tags (note: `getCachedProductDetailSettings` can use `unstable_cache` since it doesn't need cookies — it takes `tenantId` as param)
- Keep `revalidatePath` as a backup to clear the ISR page cache
- Revalidate the specific item path pattern too: `revalidatePath('/{slug}/menu/item', 'page')`

**Client-side**:
- After successful save in the customizer, call `router.refresh()` to force the client to re-fetch server components
- The `onSaved` callback should trigger this refresh in the parent `ProductDetailContent` component

### Track 3: Customization Completeness Audit

Verify every field in `ProductDetailSettings` has:
1. A color picker (or input) in `product-detail-customizer.tsx`
2. Proper wiring in `mergeSettingsWithBranding()`
3. Proper CSS variable emission in `getProductDetailThemeCSS()`
4. Actual usage in `product-detail-content.tsx` DOM elements

Fill any gaps found.

### Track 4: Testing

**Unit tests** (`tests/unit/lib/product-detail-theme.test.ts`):
- `mergeSettingsWithBranding()`: null settings, partial overrides, full overrides, fallback chains
- `computeProductDetailStyles()`: verify all style objects populated
- `getProductDetailThemeCSS()`: verify all CSS variables emitted
- `DEFAULT_PRODUCT_DETAIL_SETTINGS`: verify no undefined values

**Integration tests** (`tests/unit/actions/product-detail-settings.test.ts`):
- Save action: strips unknown fields, handles missing columns gracefully
- Field whitelist: all interface fields are in the whitelist

**Coverage test** (`tests/unit/components/product-detail-customizer-coverage.test.ts`):
- Programmatic check: every `ProductDetailSettings` color/text field has a corresponding editor in the customizer

## Implementation Order

1. Database migration (unblocks everything)
2. Server action fix (field whitelist + better revalidation)
3. Client-side cache refresh
4. Customization audit + gap filling
5. Tests

## Files Modified

- `supabase/migrations/` — new migration file
- `src/app/actions/product-detail-settings.ts` — field whitelist, revalidateTag
- `src/lib/product-detail-data.ts` — unstable_cache with tags
- `src/components/admin/product-detail-customizer.tsx` — gap filling if needed
- `src/components/customer/product-detail-content.tsx` — router.refresh on save
- `src/app/[tenant]/menu/item/[itemId]/page.tsx` — tag-based caching
- `tests/unit/lib/product-detail-theme.test.ts` — new
- `tests/unit/actions/product-detail-settings.test.ts` — new
