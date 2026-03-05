# Product Detail Branding Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix server errors when saving product detail branding, fix cache invalidation so changes appear immediately, add missing color pickers, and add comprehensive tests.

**Architecture:** Three-track fix — (1) DB migration + server action field whitelist to fix save errors, (2) improved revalidation + client-side refresh to fix stale cache, (3) add missing customizer fields and comprehensive tests.

**Tech Stack:** Next.js 15 App Router, Supabase PostgreSQL, TypeScript, Jest

---

### Task 1: Database Migration — Add Missing Text Columns

**Files:**
- Create: `supabase/migrations/20260305000001_product_detail_text_columns.sql`

**Step 1: Create the migration file**

```sql
-- Add missing text columns to product_detail_settings table.
-- These fields exist in the TypeScript interface and UI but were missing from the DB,
-- causing "unexpected response" errors on save.

ALTER TABLE public.product_detail_settings
ADD COLUMN IF NOT EXISTS variation_required_text text,
ADD COLUMN IF NOT EXISTS variation_optional_text text,
ADD COLUMN IF NOT EXISTS addon_optional_text text,
ADD COLUMN IF NOT EXISTS footer_empty_summary_text text,
ADD COLUMN IF NOT EXISTS buy_now_button_label text,
ADD COLUMN IF NOT EXISTS add_to_cart_button_label text;

COMMENT ON COLUMN public.product_detail_settings.variation_required_text IS 'Label for required variation groups (default: * Pick 1)';
COMMENT ON COLUMN public.product_detail_settings.variation_optional_text IS 'Label for optional variation groups (default: Optional)';
COMMENT ON COLUMN public.product_detail_settings.addon_optional_text IS 'Label for optional addon sections (default: (Optional))';
COMMENT ON COLUMN public.product_detail_settings.footer_empty_summary_text IS 'Text shown when no variations selected (default: Standard)';
COMMENT ON COLUMN public.product_detail_settings.buy_now_button_label IS 'Buy Now button text (default: Buy Now)';
COMMENT ON COLUMN public.product_detail_settings.add_to_cart_button_label IS 'Add to Cart button text (default: Add To Cart)';

-- Force PostgREST to reload schema cache
DO $$
BEGIN
  PERFORM pg_notify('pgrst', 'reload schema');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
```

**Step 2: Apply the migration via Supabase MCP**

Run the migration using `mcp__supabase__apply_migration` with name `product_detail_text_columns`.

**Step 3: Verify columns exist**

Run SQL: `SELECT column_name FROM information_schema.columns WHERE table_name = 'product_detail_settings' AND column_name IN ('variation_required_text', 'variation_optional_text', 'addon_optional_text', 'footer_empty_summary_text', 'buy_now_button_label', 'add_to_cart_button_label') ORDER BY column_name;`

Expected: All 6 columns present.

**Step 4: Commit**

```bash
git add supabase/migrations/20260305000001_product_detail_text_columns.sql
git commit -m "feat: add missing text columns to product_detail_settings table"
```

---

### Task 2: Server Action — Add Field Whitelist Safety Net

**Files:**
- Modify: `src/app/actions/product-detail-settings.ts`

**Step 1: Add a whitelist of valid DB columns**

At the top of the file (after imports), add a `Set` of all valid column names for the `product_detail_settings` table. This prevents future TypeScript interface additions from breaking saves before their migrations run.

```typescript
/** All columns that exist in the product_detail_settings DB table.
 *  Keep in sync with migrations. Unknown keys are stripped before upsert. */
const VALID_DB_COLUMNS = new Set([
    'tenant_id',
    'page_background_color',
    'page_background_gradient',
    'header_background_color',
    'header_button_background_color',
    'header_button_icon_color',
    'image_background_color',
    'image_placeholder_color',
    'sale_badge_background_color',
    'sale_badge_text_color',
    'product_name_color',
    'product_name_font_size',
    'product_name_font_weight',
    'breadcrumb_color',
    'breadcrumb_active_color',
    'description_color',
    'description_font_size',
    'dietary_tag_background_color',
    'dietary_tag_text_color',
    'dietary_tag_border_color',
    'variation_section_title_color',
    'variation_section_title_font_size',
    'variation_option_background_color',
    'variation_option_text_color',
    'variation_option_border_color',
    'variation_option_selected_background_color',
    'variation_option_selected_text_color',
    'variation_option_selected_border_color',
    'variation_price_modifier_color',
    'variation_required_badge_color',
    'variation_required_text',
    'variation_optional_text',
    'addon_section_title_color',
    'addon_section_title_font_size',
    'addon_background_color',
    'addon_text_color',
    'addon_border_color',
    'addon_selected_background_color',
    'addon_selected_text_color',
    'addon_selected_border_color',
    'addon_selected_check_color',
    'addon_price_color',
    'addon_price_free_text',
    'addon_optional_text',
    'related_section_title_color',
    'related_section_title_font_size',
    'related_item_background_color',
    'related_item_name_color',
    'related_item_price_color',
    'footer_background_color',
    'footer_border_color',
    'footer_shadow_color',
    'summary_text_color',
    'total_price_color',
    'original_price_color',
    'footer_empty_summary_text',
    'quantity_controls_background',
    'quantity_button_color',
    'quantity_text_color',
    'buy_now_button_background',
    'buy_now_button_text_color',
    'buy_now_button_border_color',
    'buy_now_button_label',
    'add_to_cart_button_background',
    'add_to_cart_button_text_color',
    'add_to_cart_button_shadow_color',
    'add_to_cart_button_label',
    'modal_background_color',
    'modal_close_button_color',
    'modal_close_button_background',
    'popup_modal_background_color',
    'popup_modal_title_color',
    'popup_modal_description_color',
    'popup_modal_price_color',
    'popup_modal_button_color',
    'popup_modal_button_text_color',
    'popup_modal_border_color',
    'checkout_modal_background_color',
    'checkout_modal_title_color',
    'checkout_modal_description_color',
    'checkout_modal_price_color',
    'checkout_modal_button_color',
    'checkout_modal_button_text_color',
    'checkout_modal_border_color',
    'font_family_heading',
    'font_family_body',
    'section_padding',
    'card_border_radius',
    'button_border_radius',
    'enable_animations',
    'animation_speed',
])
```

**Step 2: Add a strip function and update `saveProductDetailSettings`**

```typescript
/** Strip keys that aren't real DB columns + meta fields the DB manages */
function stripToDBColumns(settings: Partial<ProductDetailSettings>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
        if (VALID_DB_COLUMNS.has(key) && value !== undefined) {
            result[key] = value
        }
    }
    return result
}
```

In `saveProductDetailSettings`, replace:
```typescript
// OLD (lines 83-84)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const upsertData: any = { tenant_id: tenantId, ...settings }
```

With:
```typescript
const cleanSettings = stripToDBColumns(settings)
const upsertData = { tenant_id: tenantId, ...cleanSettings }
```

Also strip `id`, `created_at`, `updated_at` from the settings before upsert by NOT including them in `VALID_DB_COLUMNS` (they're already excluded above).

**Step 3: Improve revalidation — add specific item path**

Replace the two `revalidatePath` calls (lines 95-96):
```typescript
// OLD
revalidatePath(`/${tenantSlug}/menu`, 'layout')
revalidatePath(`/${tenantSlug}/admin`)
```

With:
```typescript
// Revalidate all product detail pages for this tenant
revalidatePath(`/${tenantSlug}/menu`, 'layout')
// Also revalidate specific item pages (Next.js pattern)
revalidatePath(`/${tenantSlug}/menu/item/[itemId]`, 'page')
revalidatePath(`/${tenantSlug}/admin`)
```

Do the same for `resetProductDetailSettings` (lines 130-131).

**Step 4: Run lint**

```bash
npm run lint -- --no-error-on-unmatched-pattern src/app/actions/product-detail-settings.ts
```

**Step 5: Commit**

```bash
git add src/app/actions/product-detail-settings.ts
git commit -m "fix: whitelist DB columns in save action to prevent unknown-column errors"
```

---

### Task 3: Add Missing Color Pickers to Customizer

**Files:**
- Modify: `src/components/admin/product-detail-customizer.tsx`

The following fields exist in the `ProductDetailSettings` interface and `mergeSettingsWithBranding()` but have NO color picker in the customizer:

1. `header_background_color` — missing from the `header` section
2. `image_placeholder_color` — missing from the `image` section
3. `dietary_tag_background_color`, `dietary_tag_text_color`, `dietary_tag_border_color` — no dietary tag section exists
4. `modal_background_color`, `modal_close_button_color`, `modal_close_button_background` — no image lightbox modal section
5. `variation_section_title_font_size` — missing from variation settings pane
6. `addon_section_title_font_size` — missing from addon settings pane

**Step 1: Add `header_background_color` picker to the `header` case**

In the `header` case of `renderFocusedPalette()` (around line 334), add before the existing Button Background picker:

```tsx
<ColorPickerField
    id="header_background_color"
    label="Header Background"
    value={getValue('header_background_color', '')}
    onChange={(v) => updateDraft('header_background_color', v)}
    compact
/>
```

**Step 2: Add `image_placeholder_color` to the `image` case**

In the `image` case (around line 357), add after Sale Badge Text:

```tsx
<ColorPickerField
    id="image_placeholder_color"
    label="Placeholder Color"
    value={getValue('image_placeholder_color', defaults.image_placeholder_color ?? '#9ca3af')}
    onChange={(v) => updateDraft('image_placeholder_color', v)}
    defaultValue={defaults.image_placeholder_color ?? '#9ca3af'}
    compact
/>
```

**Step 3: Add dietary tag pickers to the `product_info` case**

In the `product_info` case (around line 388), add after the breadcrumb pickers grid:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
    <ColorPickerField
        id="dietary_tag_background_color"
        label="Tag Background"
        value={getValue('dietary_tag_background_color', '')}
        onChange={(v) => updateDraft('dietary_tag_background_color', v)}
        compact
    />
    <ColorPickerField
        id="dietary_tag_text_color"
        label="Tag Text"
        value={getValue('dietary_tag_text_color', '')}
        onChange={(v) => updateDraft('dietary_tag_text_color', v)}
        compact
    />
    <ColorPickerField
        id="dietary_tag_border_color"
        label="Tag Border"
        value={getValue('dietary_tag_border_color', '')}
        onChange={(v) => updateDraft('dietary_tag_border_color', v)}
        compact
    />
</div>
```

**Step 4: Add image modal pickers — create a new section in `CustomizerSection` type**

This is not worth adding a whole new section for. Instead, add modal pickers to the `image` case after the existing pickers, wrapped in a subtitle:

```tsx
<p className="text-xs font-medium text-muted-foreground mt-3">Image Lightbox Modal</p>
<ColorPickerField
    id="modal_background_color"
    label="Modal Background"
    value={getValue('modal_background_color', defaults.modal_background_color ?? 'rgba(0,0,0,0.95)')}
    onChange={(v) => updateDraft('modal_background_color', v)}
    defaultValue={defaults.modal_background_color ?? 'rgba(0,0,0,0.95)'}
    compact
/>
<ColorPickerField
    id="modal_close_button_color"
    label="Close Button Icon"
    value={getValue('modal_close_button_color', defaults.modal_close_button_color ?? '#ffffff')}
    onChange={(v) => updateDraft('modal_close_button_color', v)}
    defaultValue={defaults.modal_close_button_color ?? '#ffffff'}
    compact
/>
<ColorPickerField
    id="modal_close_button_background"
    label="Close Button Background"
    value={getValue('modal_close_button_background', defaults.modal_close_button_background ?? 'rgba(255,255,255,0.1)')}
    onChange={(v) => updateDraft('modal_close_button_background', v)}
    defaultValue={defaults.modal_close_button_background ?? 'rgba(255,255,255,0.1)'}
    compact
/>
```

**Step 5: Add missing font size inputs to variation and addon settings panes**

In `renderFocusedSettings()` `variations` case (around line 799), add before the Required Label input:

```tsx
<div className="space-y-1">
    <Label htmlFor="variation_section_title_font_size" className="text-xs">Title Font Size</Label>
    <Input
        id="variation_section_title_font_size"
        value={getValue('variation_section_title_font_size', defaults.variation_section_title_font_size ?? '16px')}
        onChange={(e) => updateDraft('variation_section_title_font_size', e.target.value)}
        placeholder="16px"
        className="text-sm"
    />
</div>
```

In `renderFocusedSettings()` `addons` case (around line 826), add before the Free Price Label input:

```tsx
<div className="space-y-1">
    <Label htmlFor="addon_section_title_font_size" className="text-xs">Title Font Size</Label>
    <Input
        id="addon_section_title_font_size"
        value={getValue('addon_section_title_font_size', defaults.addon_section_title_font_size ?? '16px')}
        onChange={(e) => updateDraft('addon_section_title_font_size', e.target.value)}
        placeholder="16px"
        className="text-sm"
    />
</div>
```

**Step 6: Run lint**

```bash
npm run lint -- --no-error-on-unmatched-pattern src/components/admin/product-detail-customizer.tsx
```

**Step 7: Commit**

```bash
git add src/components/admin/product-detail-customizer.tsx
git commit -m "feat: add missing color pickers for header bg, dietary tags, image modal, font sizes"
```

---

### Task 4: Update Compact Panel (Colors Tab) to Match

**Files:**
- Modify: `src/components/admin/product-detail-customizer.tsx`

The compact panel (rendered when no section is focused, lines ~1096+) mirrors the focused sections. Add the same missing pickers there too.

**Step 1: Read the compact panel sections (lines 1090-1650)**

Read lines 1090-1650 of the customizer to see the exact compact panel structure.

**Step 2: Add matching pickers**

Mirror each picker added in Task 3 into the corresponding compact panel section. The compact panel has the same section titles but in a scrollable list format.

**Step 3: Run lint and commit**

```bash
npm run lint -- --no-error-on-unmatched-pattern src/components/admin/product-detail-customizer.tsx
git add src/components/admin/product-detail-customizer.tsx
git commit -m "feat: add missing color pickers to compact panel view"
```

---

### Task 5: Write Unit Tests for `mergeSettingsWithBranding`

**Files:**
- Create: `tests/unit/lib/product-detail-theme.test.ts`

**Step 1: Write the test file**

```typescript
import {
    mergeSettingsWithBranding,
    getProductDetailThemeCSS,
    computeProductDetailStyles,
    DEFAULT_PRODUCT_DETAIL_SETTINGS,
} from '@/lib/product-detail-theme'
import type { ProductDetailSettings, ProductDetailColors } from '@/lib/product-detail-theme'
import type { BrandingColors } from '@/lib/branding-utils'

// Minimal branding fixture
const mockBranding: BrandingColors = {
    primary: '#ff0000',
    secondary: '#00ff00',
    accent: '#0000ff',
    background: '#fafafa',
    header: '#333333',
    headerFont: '#ffffff',
    cards: '#f0f0f0',
    cardsBorder: '#dddddd',
    cardTitle: '#222222',
    cardPrice: '#ff0000',
    cardDescription: '#666666',
    textPrimary: '#111111',
    textSecondary: '#555555',
    textMuted: '#999999',
    border: '#cccccc',
    buttonPrimary: '#ff0000',
    buttonPrimaryText: '#ffffff',
    buttonSecondary: '#eeeeee',
    buttonSecondaryText: '#333333',
    modalBackground: '#f8f8f8',
    modalTitle: '#111111',
    modalPrice: '#ff0000',
    modalDescription: '#666666',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    link: '#3b82f6',
    shadow: 'rgba(0,0,0,0.1)',
}

describe('mergeSettingsWithBranding', () => {
    it('returns branding fallbacks when settings is null', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)
        expect(result.pageBackground).toBe(mockBranding.background)
        expect(result.productName).toBe(mockBranding.textPrimary)
        expect(result.description).toBe(mockBranding.textSecondary)
        expect(result.addToCartButtonBackground).toBe(mockBranding.buttonPrimary)
        expect(result.primary).toBe(mockBranding.primary)
    })

    it('uses branding when setting matches default value', () => {
        const settings = {
            tenant_id: 'test-tenant',
            product_name_color: '#111827', // matches DEFAULT
        } as ProductDetailSettings
        const result = mergeSettingsWithBranding(settings, mockBranding)
        // Should use branding, not the default
        expect(result.productName).toBe(mockBranding.textPrimary)
    })

    it('uses custom value when setting differs from default', () => {
        const settings = {
            tenant_id: 'test-tenant',
            product_name_color: '#abcdef',
        } as ProductDetailSettings
        const result = mergeSettingsWithBranding(settings, mockBranding)
        expect(result.productName).toBe('#abcdef')
    })

    it('preserves text label fields', () => {
        const settings = {
            tenant_id: 'test-tenant',
            buy_now_button_label: 'Order Now',
            add_to_cart_button_label: 'Add',
            variation_required_text: 'Required',
            variation_optional_text: 'Choose',
            addon_optional_text: 'Extra',
            footer_empty_summary_text: 'Base',
        } as ProductDetailSettings
        const result = mergeSettingsWithBranding(settings, mockBranding)
        expect(result.buyNowButtonLabel).toBe('Order Now')
        expect(result.addToCartButtonLabel).toBe('Add')
        expect(result.variationRequiredText).toBe('Required')
        expect(result.variationOptionalText).toBe('Choose')
        expect(result.addonOptionalText).toBe('Extra')
        expect(result.footerEmptySummaryText).toBe('Base')
    })

    it('returns complete ProductDetailColors object with no undefined values', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)
        const entries = Object.entries(result)
        for (const [key, value] of entries) {
            expect(value).toBeDefined()
            if (key !== 'pageGradient') {
                // pageGradient is the only optional field
                expect(value).not.toBeNull()
            }
        }
    })

    it('uses addon branding fallbacks for selected states', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)
        expect(result.addonSelectedText).toBe(mockBranding.primary)
        expect(result.addonSelectedBorder).toBe(mockBranding.primary)
        expect(result.addonSelectedCheck).toBe(mockBranding.primary)
    })

    it('uses variation branding fallbacks for selected states', () => {
        const result = mergeSettingsWithBranding(null, mockBranding)
        expect(result.variationOptionSelectedBackground).toBe(mockBranding.primary)
        expect(result.variationOptionSelectedBorder).toBe(mockBranding.primary)
    })
})

describe('getProductDetailThemeCSS', () => {
    it('returns CSS custom properties for all theme values', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const css = getProductDetailThemeCSS(colors)

        // Check key CSS variables exist
        expect(css['--pd-page-background']).toBeDefined()
        expect(css['--pd-product-name']).toBeDefined()
        expect(css['--pd-variation-selected-bg']).toBeDefined()
        expect(css['--pd-addon-check']).toBeDefined()
        expect(css['--pd-add-cart-bg']).toBeDefined()
        expect(css['--pd-footer-bg']).toBeDefined()
        expect(css['--pd-primary']).toBeDefined()
    })

    it('sets transition duration to 0s when animations disabled', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        colors.enableAnimations = false
        const css = getProductDetailThemeCSS(colors)
        expect(css['--pd-transition-duration']).toBe('0s')
    })

    it('sets correct transition duration for each speed', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        colors.enableAnimations = true

        colors.animationSpeed = 'slow'
        expect(getProductDetailThemeCSS(colors)['--pd-transition-duration']).toBe('0.5s')

        colors.animationSpeed = 'normal'
        expect(getProductDetailThemeCSS(colors)['--pd-transition-duration']).toBe('0.3s')

        colors.animationSpeed = 'fast'
        expect(getProductDetailThemeCSS(colors)['--pd-transition-duration']).toBe('0.15s')
    })
})

describe('computeProductDetailStyles', () => {
    it('returns all required style objects', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles.container).toBeDefined()
        expect(styles.name).toBeDefined()
        expect(styles.description).toBeDefined()
        expect(styles.variationButton).toBeDefined()
        expect(styles.variationButtonSelected).toBeDefined()
        expect(styles.addonButton).toBeDefined()
        expect(styles.addonButtonSelected).toBeDefined()
        expect(styles.footer).toBeDefined()
        expect(styles.buttonBuyNow).toBeDefined()
        expect(styles.buttonAddToCart).toBeDefined()
    })

    it('applies branding colors to button styles', () => {
        const colors = mergeSettingsWithBranding(null, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles.buttonAddToCart.backgroundColor).toBe(mockBranding.buttonPrimary)
        expect(styles.buttonAddToCart.color).toBe(mockBranding.buttonPrimaryText)
    })

    it('applies custom colors when explicitly set', () => {
        const settings = {
            tenant_id: 'test',
            add_to_cart_button_background: '#123456',
            add_to_cart_button_text_color: '#654321',
        } as ProductDetailSettings
        const colors = mergeSettingsWithBranding(settings, mockBranding)
        const styles = computeProductDetailStyles(colors)

        expect(styles.buttonAddToCart.backgroundColor).toBe('#123456')
        expect(styles.buttonAddToCart.color).toBe('#654321')
    })
})

describe('DEFAULT_PRODUCT_DETAIL_SETTINGS', () => {
    it('has no undefined values', () => {
        for (const [key, value] of Object.entries(DEFAULT_PRODUCT_DETAIL_SETTINGS)) {
            expect(value).toBeDefined()
            expect(value).not.toBeNull()
        }
    })
})
```

**Step 2: Run the tests**

```bash
npm run test -- --testPathPattern="product-detail-theme"
```

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add tests/unit/lib/product-detail-theme.test.ts
git commit -m "test: add comprehensive unit tests for product detail theme utilities"
```

---

### Task 6: Write Integration Test for Save Action Field Whitelist

**Files:**
- Create: `tests/unit/actions/product-detail-settings.test.ts`

**Step 1: Write the test**

This test verifies that the `VALID_DB_COLUMNS` set and `stripToDBColumns` function work correctly. Since the actual save function requires Supabase, we test the exported utility.

First, export `VALID_DB_COLUMNS` and `stripToDBColumns` from the action file (or extract them to a shared util if server-only exports are problematic).

If server action exports are not testable, extract `VALID_DB_COLUMNS` and `stripToDBColumns` to `src/lib/product-detail-settings-utils.ts`:

```typescript
// src/lib/product-detail-settings-utils.ts
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

export const VALID_DB_COLUMNS = new Set([
    // ... (same set as Task 2)
])

export function stripToDBColumns(settings: Partial<ProductDetailSettings>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(settings)) {
        if (VALID_DB_COLUMNS.has(key) && value !== undefined) {
            result[key] = value
        }
    }
    return result
}
```

Then import it in the server action.

Test file:

```typescript
import { VALID_DB_COLUMNS, stripToDBColumns } from '@/lib/product-detail-settings-utils'
import type { ProductDetailSettings } from '@/lib/product-detail-theme'

describe('stripToDBColumns', () => {
    it('keeps valid DB columns', () => {
        const settings: Partial<ProductDetailSettings> = {
            page_background_color: '#ffffff',
            product_name_color: '#111827',
            enable_animations: true,
        }
        const result = stripToDBColumns(settings)
        expect(result.page_background_color).toBe('#ffffff')
        expect(result.product_name_color).toBe('#111827')
        expect(result.enable_animations).toBe(true)
    })

    it('strips unknown fields', () => {
        const settings = {
            page_background_color: '#ffffff',
            some_future_field: '#000000',
            another_unknown: 'value',
        } as Partial<ProductDetailSettings>
        const result = stripToDBColumns(settings)
        expect(result.page_background_color).toBe('#ffffff')
        expect(result).not.toHaveProperty('some_future_field')
        expect(result).not.toHaveProperty('another_unknown')
    })

    it('strips meta fields (id, created_at, updated_at)', () => {
        const settings: Partial<ProductDetailSettings> = {
            id: 'some-uuid',
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            page_background_color: '#ffffff',
        }
        const result = stripToDBColumns(settings)
        expect(result).not.toHaveProperty('id')
        expect(result).not.toHaveProperty('created_at')
        expect(result).not.toHaveProperty('updated_at')
        expect(result.page_background_color).toBe('#ffffff')
    })

    it('strips undefined values', () => {
        const settings: Partial<ProductDetailSettings> = {
            page_background_color: '#ffffff',
            product_name_color: undefined,
        }
        const result = stripToDBColumns(settings)
        expect(result.page_background_color).toBe('#ffffff')
        expect(result).not.toHaveProperty('product_name_color')
    })

    it('includes newly added text columns', () => {
        const settings: Partial<ProductDetailSettings> = {
            variation_required_text: '* Pick 1',
            variation_optional_text: 'Optional',
            addon_optional_text: '(Optional)',
            footer_empty_summary_text: 'Standard',
            buy_now_button_label: 'Buy Now',
            add_to_cart_button_label: 'Add To Cart',
        }
        const result = stripToDBColumns(settings)
        expect(Object.keys(result)).toHaveLength(6)
        expect(result.variation_required_text).toBe('* Pick 1')
        expect(result.add_to_cart_button_label).toBe('Add To Cart')
    })
})

describe('VALID_DB_COLUMNS', () => {
    it('does not include meta fields', () => {
        expect(VALID_DB_COLUMNS.has('id')).toBe(false)
        expect(VALID_DB_COLUMNS.has('created_at')).toBe(false)
        expect(VALID_DB_COLUMNS.has('updated_at')).toBe(false)
    })

    it('includes all color columns', () => {
        const colorColumns = [
            'page_background_color',
            'header_background_color',
            'variation_option_selected_background_color',
            'addon_selected_check_color',
            'footer_background_color',
            'add_to_cart_button_background',
            'popup_modal_background_color',
            'checkout_modal_button_text_color',
        ]
        for (const col of colorColumns) {
            expect(VALID_DB_COLUMNS.has(col)).toBe(true)
        }
    })

    it('includes text label columns', () => {
        const textColumns = [
            'variation_required_text',
            'variation_optional_text',
            'addon_optional_text',
            'footer_empty_summary_text',
            'buy_now_button_label',
            'add_to_cart_button_label',
        ]
        for (const col of textColumns) {
            expect(VALID_DB_COLUMNS.has(col)).toBe(true)
        }
    })
})
```

**Step 2: Run tests**

```bash
npm run test -- --testPathPattern="product-detail-settings"
```

**Step 3: Commit**

```bash
git add src/lib/product-detail-settings-utils.ts tests/unit/actions/product-detail-settings.test.ts
git commit -m "test: add field whitelist tests for product detail settings save"
```

---

### Task 7: Manual Verification

**Step 1: Start dev server**

```bash
npm run dev
```

**Step 2: Navigate to a product detail page as admin**

Open a product detail page (e.g., `http://localhost:3000/[tenant]/menu/item/[itemId]`).

**Step 3: Open customizer, change colors, save**

1. Click the 🎨 button
2. Change a few colors (e.g., product name, add-to-cart button)
3. Click "Save Changes"
4. Verify: no error toast, success toast appears
5. Verify: changes reflect immediately on the page

**Step 4: Hard refresh to verify persistence**

Refresh the page. Colors should persist.

**Step 5: Run full test suite**

```bash
npm run test
npm run lint
```

**Step 6: Commit final state if needed**

```bash
git add -A
git commit -m "fix: product detail branding save, cache, and customization completeness"
```
