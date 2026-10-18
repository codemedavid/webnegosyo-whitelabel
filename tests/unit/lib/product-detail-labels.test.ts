/**
 * Labels the owner types in the Studio reach the modifier-group product page;
 * untouched labels keep the page's standard wording.
 */

import { getTenantBranding } from '@/lib/branding-utils'
import { modifierLabelsFrom } from '@/lib/product-detail-labels'
import { resolveProductDetailColors, type ProductDetailSettings } from '@/lib/product-detail-theme'

const BRAND = getTenantBranding({})

function labelsFor(settings: Partial<ProductDetailSettings> | null) {
    return modifierLabelsFrom(resolveProductDetailColors(settings as ProductDetailSettings | null, BRAND))
}

describe('modifierLabelsFrom', () => {
    it('passes nothing when the owner kept every default', () => {
        expect(labelsFor(null)).toEqual({ rule: {}, freeLabel: undefined })
    })

    it('passes the labels the owner changed', () => {
        expect(labelsFor({
            variation_required_text: 'Kailangan',
            variation_optional_text: 'Pwede',
            addon_optional_text: 'Dagdag',
            addon_price_free_text: 'Libre',
        })).toEqual({
            rule: { required: 'Kailangan', optional: 'Pwede', quantityOptional: 'Dagdag' },
            freeLabel: 'Libre',
        })
    })
})
