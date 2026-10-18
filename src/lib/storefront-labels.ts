/**
 * The store's own words for the ordering screens' system labels (brand editor
 * v2, Phase 4). Stored in `tenants.storefront_labels` as key → text. A key
 * the owner never set keeps each component's own wording, so templates that
 * phrase a label differently ("Your Cart" vs "Cart") stay as designed until
 * the owner types their own.
 */

import { z } from 'zod'

export type LabelScreen = 'menu' | 'item' | 'cart' | 'checkout' | 'confirmation'

export interface StorefrontLabelDefinition {
    screen: LabelScreen
    /** What the owner sees in the Studio. */
    label: string
    /** Today's wording — the Studio's placeholder. */
    example: string
    maxLength: number
}

const SHORT = 24
const MEDIUM = 48
const LONG = 90

export const STOREFRONT_LABELS = {
    'menu.add': { screen: 'menu', label: 'Add button', example: 'Add', maxLength: SHORT },
    'menu.sold_out': { screen: 'menu', label: 'Sold out', example: 'Sold out', maxLength: SHORT },
    'menu.unavailable': { screen: 'menu', label: 'Unavailable', example: 'Unavailable', maxLength: SHORT },
    'menu.search_placeholder': { screen: 'menu', label: 'Search box hint', example: 'Search the menu…', maxLength: MEDIUM },
    'menu.no_results': { screen: 'menu', label: 'Nothing found', example: 'No items found', maxLength: MEDIUM },
    'item.sale': { screen: 'item', label: 'Sale badge', example: 'Sale', maxLength: SHORT },
    'item.related_title': { screen: 'item', label: '"You might also like" title', example: 'You might also like', maxLength: MEDIUM },
    'item.unavailable': { screen: 'item', label: 'Unavailable notice', example: 'This item is currently unavailable.', maxLength: LONG },
    'item.pickup_date': { screen: 'item', label: 'Pickup date title', example: 'Choose a pickup date', maxLength: MEDIUM },
    'item.added_title': { screen: 'item', label: 'After adding — title', example: 'Added to your order', maxLength: MEDIUM },
    'item.added_pairings': { screen: 'item', label: 'After adding — suggestions', example: 'Goes well with it', maxLength: MEDIUM },
    'item.view_cart': { screen: 'item', label: 'View cart button', example: 'View cart', maxLength: SHORT },
    'cart.title': { screen: 'cart', label: 'Cart title', example: 'Your Cart', maxLength: MEDIUM },
    'cart.empty': { screen: 'cart', label: 'Empty cart', example: 'Your cart is empty', maxLength: MEDIUM },
    'cart.checkout': { screen: 'cart', label: 'Checkout button', example: 'Proceed to Checkout', maxLength: MEDIUM },
    'cart.total': { screen: 'cart', label: 'Total', example: 'Total', maxLength: SHORT },
    'checkout.title': { screen: 'checkout', label: 'Checkout title', example: 'Checkout', maxLength: MEDIUM },
    'checkout.order_type': { screen: 'checkout', label: 'Order type question', example: 'How would you like to receive your order?', maxLength: LONG },
    'checkout.customer': { screen: 'checkout', label: 'Your details title', example: 'Customer Information', maxLength: MEDIUM },
    'checkout.summary': { screen: 'checkout', label: 'Order summary title', example: 'Order Summary', maxLength: MEDIUM },
    'checkout.payment': { screen: 'checkout', label: 'Payment title', example: 'Payment', maxLength: MEDIUM },
    'checkout.total': { screen: 'checkout', label: 'Total', example: 'Total', maxLength: SHORT },
    'checkout.voucher': { screen: 'checkout', label: 'Voucher prompt', example: 'Have a voucher?', maxLength: MEDIUM },
    'confirmation.title': { screen: 'confirmation', label: 'Order placed title', example: 'Order Placed!', maxLength: MEDIUM },
} as const satisfies Record<string, StorefrontLabelDefinition>

export type StorefrontLabelKey = keyof typeof STOREFRONT_LABELS

export const STOREFRONT_LABEL_KEYS = Object.keys(STOREFRONT_LABELS) as StorefrontLabelKey[]

/** Write-side validation: known keys only, trimmed, within each label's length. */
export const storefrontLabelsSchema = z.object(
    Object.fromEntries(
        STOREFRONT_LABEL_KEYS.map((key) => [key, z.string().trim().max(STOREFRONT_LABELS[key].maxLength).optional()])
    ) as Record<StorefrontLabelKey, z.ZodOptional<z.ZodString>>
).strict()

export type StorefrontLabels = Partial<Record<StorefrontLabelKey, string>>

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The owner's labels from a tenant row: known keys, non-blank, within length. Untrusted input. */
export function readStorefrontLabels(tenant: Record<string, unknown> | null | undefined): StorefrontLabels {
    const raw = tenant?.storefront_labels
    if (!isPlainObject(raw)) return {}
    const entries = STOREFRONT_LABEL_KEYS.flatMap((key) => {
        const value = raw[key]
        if (typeof value !== 'string') return []
        const trimmed = value.trim()
        return trimmed && trimmed.length <= STOREFRONT_LABELS[key].maxLength ? [[key, trimmed] as const] : []
    })
    return Object.fromEntries(entries)
}

/** The words typed into a label: one line, trimmed, at most the label's length. */
export function cleanLabelText(raw: string, maxLength: number): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
