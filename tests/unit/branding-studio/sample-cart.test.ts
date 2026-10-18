/**
 * Cart and checkout previews show sample dishes when the owner's own cart is
 * empty, instead of bouncing to the menu (plan §1.5). The list arrives by
 * postMessage, so it is untrusted.
 */

import { buildSampleCart, SAMPLE_CART_KEY } from '@/lib/branding-studio/sample-cart'

const DISH = { id: 'd1', name: 'Java Chip', price: 39, image_url: '', variations: [], addons: [] }

describe('buildSampleCart', () => {
    it('turns dishes into cart lines', () => {
        const cart = buildSampleCart([DISH, { ...DISH, id: 'd2', name: 'Okinawa', price: 49 }])

        expect(cart.map((line) => [line.menu_item.name, line.quantity, line.subtotal])).toEqual([
            ['Java Chip', 2, 78],
            ['Okinawa', 1, 49],
        ])
        expect(cart[0].id).toMatch(/^sample-/)
    })

    it('ignores anything that is not a dish', () => {
        expect(buildSampleCart('nope')).toEqual([])
        expect(buildSampleCart([{ id: 'x' }, null, { ...DISH, price: 'free' }])).toEqual([])
    })

    it('caps the sample at three lines', () => {
        expect(buildSampleCart(Array.from({ length: 8 }, (_, index) => ({ ...DISH, id: `d${index}` })))).toHaveLength(3)
    })

    it('names its draft key', () => {
        expect(SAMPLE_CART_KEY).toBe('__sampleCart')
    })
})
