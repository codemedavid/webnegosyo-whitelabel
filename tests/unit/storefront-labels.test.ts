/**
 * Owner wording for storefront labels: only known keys, trimmed, within
 * length; anything else is ignored on read and refused on write.
 */

import { readStorefrontLabels, storefrontLabelsSchema, STOREFRONT_LABELS } from '@/lib/storefront-labels'

describe('readStorefrontLabels', () => {
    it('keeps the owner\'s words for known labels', () => {
        expect(readStorefrontLabels({ storefront_labels: { 'cart.title': '  Your tray ' } })).toEqual({ 'cart.title': 'Your tray' })
    })

    it('ignores unknown keys, blanks, non-text and over-long text', () => {
        const labels = readStorefrontLabels({
            storefront_labels: {
                'cart.title': '',
                'nope.key': 'x',
                'cart.total': 5,
                'menu.add': 'x'.repeat(STOREFRONT_LABELS['menu.add'].maxLength + 1),
            },
        })

        expect(labels).toEqual({})
    })

    it('reads nothing from a missing or malformed column', () => {
        expect(readStorefrontLabels(null)).toEqual({})
        expect(readStorefrontLabels({ storefront_labels: ['cart.title'] })).toEqual({})
    })
})

describe('storefrontLabelsSchema', () => {
    it('accepts known labels', () => {
        expect(storefrontLabelsSchema.parse({ 'checkout.payment': 'Bayad' })).toEqual({ 'checkout.payment': 'Bayad' })
    })

    it('refuses unknown keys and over-long text', () => {
        expect(() => storefrontLabelsSchema.parse({ 'nope.key': 'x' })).toThrow()
        expect(() => storefrontLabelsSchema.parse({ 'menu.add': 'x'.repeat(100) })).toThrow()
    })
})
