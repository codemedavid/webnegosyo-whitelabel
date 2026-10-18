/**
 * The "just added" pairing sheet on the product page follows the Studio's
 * Product Detail → Pairing pop-up colours (they used to be saved and ignored).
 */

import { getTenantBranding } from '@/lib/branding-utils'
import { resolveProductDetailColors, type ProductDetailSettings } from '@/lib/product-detail-theme'
import { addedSheetThemeFrom, offerThemeFromBranding } from '@/components/customer/offers/offer-theme'

const BRAND = getTenantBranding({ background_color: '#171717', text_primary_color: '#fafafa' })

describe('addedSheetThemeFrom', () => {
    it('uses the pairing pop-up colours the owner set', () => {
        const colors = resolveProductDetailColors({
            popup_modal_background_color: '#222222',
            popup_modal_title_color: '#fefefe',
            popup_modal_description_color: '#cccccc',
            popup_modal_price_color: '#e8b83f',
            popup_modal_button_color: '#e8b83f',
            popup_modal_button_text_color: '#1a1a1a',
            popup_modal_border_color: '#444444',
        } as ProductDetailSettings, BRAND)

        const theme = addedSheetThemeFrom(offerThemeFromBranding(BRAND), colors)

        expect(theme).toMatchObject({
            surface: '#222222',
            text: '#fefefe',
            muted: '#cccccc',
            price: '#e8b83f',
            accent: '#e8b83f',
            accentText: '#1a1a1a',
            border: '#444444',
        })
    })

    it('matches the store\'s offer colours when nothing is set', () => {
        const base = offerThemeFromBranding(BRAND)

        const theme = addedSheetThemeFrom(base, resolveProductDetailColors(null, BRAND))

        expect(theme.surface).toBe(base.surface)
        expect(theme.text).toBe(base.text)
        expect(theme.accent).toBe(base.accent)
    })
})
