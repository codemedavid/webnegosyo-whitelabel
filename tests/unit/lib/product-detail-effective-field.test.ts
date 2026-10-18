/**
 * The Studio's Product Detail rows must show what the product page renders.
 * The page resolves colours through mergeSettingsWithBranding (blank → brand);
 * the editor used
 * a flat saved → default cascade, so e.g. a saved page background of #ffffff
 * showed as white while a dark store's page rendered #171717 (2026-10-18).
 */

import { contrastRatio } from '@/lib/color-contrast'
import { getTenantBranding } from '@/lib/branding-utils'
import { resolveProductDetailColors, type ProductDetailColors } from '@/lib/product-detail-theme'
import {
    getProductDetailFieldIds,
    PRODUCT_DETAIL_FIELD_INDEX,
    productContrastIssue,
    resolveProductFieldEffective,
} from '@/lib/product-detail-registry'

const DARK_STORE = getTenantBranding({
    background_color: '#171717',
    cards_color: '#1a1a1a',
    text_primary_color: '#fafafa',
    primary_color: '#e8b83f',
    border_color: '#333333',
    button_primary_text_color: '#1a1a1a',
})

function sentinelFor(fieldId: string): unknown {
    const field = PRODUCT_DETAIL_FIELD_INDEX[fieldId]
    if (field.type === 'color') return '#123457'
    if (field.type === 'toggle') return !field.default
    if (field.type === 'select') return field.options?.[field.options.length - 1]
    return 'sentinel-7'
}

describe('resolveProductFieldEffective', () => {
    it('resolves every field to what the product page renders for it', () => {
        const mismatched = getProductDetailFieldIds().filter((fieldId) => {
            const sentinel = sentinelFor(fieldId)
            const result = resolveProductFieldEffective(fieldId, { [fieldId]: sentinel }, {}, DARK_STORE)
            return result.value !== sentinel || !result.isSet
        })

        expect(mismatched).toEqual([])
    })

    it('shows a saved white page background as the owner\'s pick', () => {
        const result = resolveProductFieldEffective(
            'page_background_color',
            {},
            { page_background_color: '#ffffff' },
            DARK_STORE,
        )

        expect(result).toEqual({ value: '#ffffff', isSet: true, inheritLabel: 'Brand' })
    })

    it('shows the brand colour for a blank field that follows the brand', () => {
        const result = resolveProductFieldEffective('add_to_cart_button_text_color', {}, {}, DARK_STORE)

        expect(result).toEqual({ value: DARK_STORE.buttonPrimaryText, isSet: false, inheritLabel: 'Brand' })
    })

    it('labels a blank field with a fixed fallback as Default', () => {
        const result = resolveProductFieldEffective('quantity_controls_background', {}, {}, DARK_STORE)

        expect(result).toEqual({ value: '#f3f4f6', isSet: false, inheritLabel: 'Default' })
    })

    it('labels a brand-following field Brand even when the brand colour equals the default', () => {
        const lightStore = getTenantBranding({ background_color: '#ffffff' })

        const result = resolveProductFieldEffective('page_background_color', {}, {}, lightStore)

        expect(result).toEqual({ value: '#ffffff', isSet: false, inheritLabel: 'Brand' })
    })

    it('shows the owner\'s own value as set', () => {
        const result = resolveProductFieldEffective(
            'addon_text_color',
            { addon_text_color: '#fafafa' },
            { addon_text_color: '#111111' },
            DARK_STORE,
        )

        expect(result).toEqual({ value: '#fafafa', isSet: true, inheritLabel: 'Brand' })
    })

    it('treats a cleared draft entry as blank even when a value is saved', () => {
        const result = resolveProductFieldEffective(
            'addon_text_color',
            { addon_text_color: '' },
            { addon_text_color: '#123456' },
            DARK_STORE,
        )

        expect(result.value).toBe(DARK_STORE.textPrimary)
        expect(result.isSet).toBe(false)
    })

    it('agrees with the product page for every field', () => {
        const saved = { addon_background_color: '#1a1a1a', description_color: '#c0c4cc', product_name_font_size: '28px' }
        const colors = resolveProductDetailColors(saved as never, DARK_STORE) as unknown as Record<keyof ProductDetailColors, unknown>

        expect(resolveProductFieldEffective('addon_background_color', {}, saved, DARK_STORE).value).toBe(colors.addonBackground)
        expect(resolveProductFieldEffective('description_color', {}, saved, DARK_STORE).value).toBe(colors.description)
        expect(resolveProductFieldEffective('product_name_font_size', {}, saved, DARK_STORE).value).toBe('28px')
    })
})

describe('resolveProductFieldEffective with an unreadable pick', () => {
    it('shows the owner\'s own pick, still marked as theirs', () => {
        const result = resolveProductFieldEffective(
            'variation_option_text_color',
            { variation_option_text_color: '#fefefe', variation_option_background_color: '#ffffff' },
            {},
            DARK_STORE,
        )

        expect(result).toMatchObject({ value: '#fefefe', isSet: true })
    })
})

describe('productContrastIssue', () => {
    it('flags a text colour the owner chose that is hard to read on its fill', () => {
        const issue = productContrastIssue(
            'variation_option_text_color',
            { variation_option_text_color: '#fefefe', variation_option_background_color: '#ffffff' },
            {},
            DARK_STORE,
        )

        expect(issue).not.toBeNull()
        expect(issue?.ratio).toBeLessThan(1.1)
        expect(contrastRatio(issue!.fix, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('says nothing when the chosen colour reads', () => {
        const issue = productContrastIssue(
            'variation_option_text_color',
            { variation_option_text_color: '#111111', variation_option_background_color: '#ffffff' },
            {},
            DARK_STORE,
        )

        expect(issue).toBeNull()
    })

    it('says nothing for text the store keeps readable on its own', () => {
        const issue = productContrastIssue('variation_option_text_color', { variation_option_background_color: '#ffffff' }, {}, DARK_STORE)

        expect(issue).toBeNull()
    })

    it('says nothing for fields that are not text on a fill', () => {
        expect(productContrastIssue('variation_option_background_color', {}, {}, DARK_STORE)).toBeNull()
    })
})
