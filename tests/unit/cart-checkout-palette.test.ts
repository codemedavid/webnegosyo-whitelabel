/**
 * Cart and checkout follow the store's brand when their own colours are
 * blank (owner decision 2026-10-18, plan Q4): a dark store gets a dark cart,
 * not the template's white-and-orange default. Explicit cart/checkout colours
 * still win.
 */

import { getCartPalette, getCheckoutPalette, getTenantBranding } from '@/lib/branding-utils'

const DARK = { background_color: '#171717', cards_color: '#1a1a1a', text_primary_color: '#fafafa', text_secondary_color: '#a3a3a3', border_color: '#333333' }

describe.each([
    ['cart', getCartPalette, 'cart'],
    ['checkout', getCheckoutPalette, 'checkout'],
] as const)('%s palette', (_name, palette, prefix) => {
    it('inherits the brand for blank colours', () => {
        const result = palette(DARK, getTenantBranding(DARK))

        expect(result).toMatchObject({
            background: '#171717',
            cardBackground: '#1a1a1a',
            summaryBackground: '#1a1a1a',
            text: '#fafafa',
            mutedText: '#a3a3a3',
            border: '#333333',
        })
    })

    it('keeps an explicit colour', () => {
        const tenant = { ...DARK, [`${prefix}_card_background_color`]: '#ffffff', [`${prefix}_text_color`]: '#111111' }

        expect(palette(tenant, getTenantBranding(tenant))).toMatchObject({ cardBackground: '#ffffff', text: '#111111' })
    })
})

describe('cart and checkout text stays readable on the inherited cards', () => {
    // contrastRatio imported lazily to keep this file's header unchanged
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { contrastRatio } = require('@/lib/color-contrast') as typeof import('@/lib/color-contrast')

    it.each([['cart', getCartPalette], ['checkout', getCheckoutPalette]] as const)('%s: black text set for the old white cards stays readable on dark cards', (prefix, palette) => {
        // Uncle-Drei's set cart text to black when cart cards were always white.
        const tenant = { ...DARK, [`${prefix}_text_color`]: '#000000', [`${prefix}_muted_text_color`]: '#333333' }

        const result = palette(tenant, getTenantBranding(tenant))

        expect(contrastRatio(result.text!, result.cardBackground!)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(result.mutedText!, result.cardBackground!)).toBeGreaterThanOrEqual(4.5)
    })

    it('keeps readable text exactly', () => {
        const tenant = { ...DARK, cart_text_color: '#fafafa' }

        expect(getCartPalette(tenant, getTenantBranding(tenant)).text).toBe('#fafafa')
    })
})

describe('button text', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { contrastRatio } = require('@/lib/color-contrast') as typeof import('@/lib/color-contrast')

    it('keeps white button text readable on a gold button', () => {
        const tenant = { button_primary_color: '#E8B83F', cart_button_text_color: '#ffffff' }
        const result = getCartPalette(tenant, getTenantBranding(tenant))

        expect(contrastRatio(result.accentText, '#E8B83F')).toBeGreaterThanOrEqual(4.5)
    })
})
