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
        } as unknown as Partial<ProductDetailSettings>
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
