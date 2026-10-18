/**
 * Text the owner never chose must stay readable on whatever fill it sits on.
 * The owner who set Option background to white (and left Option text blank)
 * on a dark store got the brand's near-white text on white chips (2026-10-18).
 * A chosen colour that still reads is kept exactly; one that doesn't is shown
 * in readable ink (the Studio flags it with a one-tap Fix).
 */

import { getTenantBranding } from '@/lib/branding-utils'
import { contrastRatio } from '@/lib/color-contrast'
import { resolveProductDetailColors, type ProductDetailSettings } from '@/lib/product-detail-theme'

const DARK_STORE = getTenantBranding({
    background_color: '#171717',
    cards_color: '#1a1a1a',
    text_primary_color: '#fafafa',
    primary_color: '#e8b83f',
    border_color: '#333333',
})

function settings(values: Partial<ProductDetailSettings>): ProductDetailSettings {
    return values as ProductDetailSettings
}

describe('resolveProductDetailColors readable text', () => {
    it('gives unchosen option text dark ink when the owner sets a white option background', () => {
        const colors = resolveProductDetailColors(settings({ variation_option_background_color: '#ffffff' }), DARK_STORE)

        expect(colors.variationOptionBackground).toBe('#ffffff')
        expect(contrastRatio(colors.variationOptionText, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('treats a text colour saved at the table default as not chosen', () => {
        const colors = resolveProductDetailColors(settings({
            variation_option_background_color: '#1a1a1a',
            variation_option_text_color: '#374151',
        }), DARK_STORE)

        expect(contrastRatio(colors.variationOptionText, '#1a1a1a')).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps a chosen text colour that reads', () => {
        const colors = resolveProductDetailColors(settings({
            variation_option_background_color: '#ffffff',
            variation_option_text_color: '#8a1c1c',
        }), DARK_STORE)

        expect(colors.variationOptionText).toBe('#8a1c1c')
    })

    it('never lets a chosen colour make text unreadable for diners', () => {
        // White prices chosen for dark chips, then the chips turned white.
        const colors = resolveProductDetailColors(settings({
            variation_option_background_color: '#ffffff',
            variation_price_modifier_color: '#ffffff',
        }), DARK_STORE)

        expect(contrastRatio(colors.variationPriceModifier, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    })

    it('makes picked add-on text readable on a picked fill the owner set', () => {
        const colors = resolveProductDetailColors(settings({ addon_selected_background_color: '#e8b83f' }), DARK_STORE)

        expect(contrastRatio(colors.addonSelectedText, '#e8b83f')).toBeGreaterThanOrEqual(4.5)
    })

    it('makes the chosen-chip default white text readable on a pale brand', () => {
        const paleStore = getTenantBranding({ primary_color: '#ffe066' })

        const colors = resolveProductDetailColors(null, paleStore)

        expect(contrastRatio(colors.variationOptionSelectedText, colors.variationOptionSelectedBackground)).toBeGreaterThanOrEqual(4.5)
    })

    it('makes button labels readable on button fills the owner set', () => {
        const colors = resolveProductDetailColors(settings({
            add_to_cart_button_background: '#ffffff',
            buy_now_button_background: '#111111',
        }), DARK_STORE)

        expect(contrastRatio(colors.addToCartButtonText, '#ffffff')).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(colors.buyNowButtonText, '#111111')).toBeGreaterThanOrEqual(4.5)
    })

    it('changes nothing on a store whose colours already read', () => {
        const colors = resolveProductDetailColors(settings({
            variation_option_background_color: '#1a1a1a',
            variation_option_text_color: '#fafafa',
            addon_background_color: '#1a1a1a',
            addon_text_color: '#ffffff',
        }), DARK_STORE)

        expect(colors.variationOptionText).toBe('#fafafa')
        expect(colors.addonText).toBe('#ffffff')
    })
})

describe('page gradient', () => {
    it('keeps unsafe gradient text off the page', () => {
        const colors = resolveProductDetailColors(settings({ page_background_gradient: 'red), url(//x.example/beacon' }), DARK_STORE)

        expect(colors.pageGradient).toBeUndefined()
    })

    it('keeps a plain colour gradient', () => {
        const colors = resolveProductDetailColors(settings({ page_background_gradient: '180deg, #ffffff 0%, rgb(20, 20, 20) 100%' }), DARK_STORE)

        expect(colors.pageGradient).toBe('180deg, #ffffff 0%, rgb(20, 20, 20) 100%')
    })

    it('does not force page text against the flat colour under a gradient', () => {
        const colors = resolveProductDetailColors(settings({
            page_background_color: '#fefefe',
            page_background_gradient: '180deg, #000000, #111111',
            product_name_color: '#fafafa',
        }), DARK_STORE)

        expect(colors.productName).toBe('#fafafa')
    })
})
