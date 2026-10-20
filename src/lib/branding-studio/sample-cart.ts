/**
 * Sample cart lines for the Studio's Cart and Checkout previews, used only
 * while the previewing browser's own cart is empty — never saved, never sent
 * as an order. The dishes come from the Studio by postMessage: untrusted.
 */

import type { CartItem, MenuItem } from '@/types/database'

/** Draft meta key the Studio streams the sample dishes under. */
export const SAMPLE_CART_KEY = '__sampleCart'

const MAX_SAMPLE_LINES = 3

function isDish(value: unknown): value is MenuItem {
    if (typeof value !== 'object' || value === null) return false
    const dish = value as Record<string, unknown>
    return typeof dish.id === 'string' && typeof dish.name === 'string' && typeof dish.price === 'number' && Number.isFinite(dish.price)
}

export function buildSampleCart(dishes: unknown): CartItem[] {
    if (!Array.isArray(dishes)) return []
    return dishes.filter(isDish).slice(0, MAX_SAMPLE_LINES).map((dish, index) => {
        const quantity = index === 0 ? 2 : 1
        return {
            id: `sample-${dish.id}`,
            menu_item: { ...dish, variations: dish.variations ?? [], addons: dish.addons ?? [] },
            selected_addons: [],
            quantity,
            subtotal: dish.price * quantity,
        }
    })
}
