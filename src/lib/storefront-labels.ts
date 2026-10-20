/**
 * The store's own words for the ordering screens' system labels (brand editor
 * v2, Phase 4). Stored in `tenants.storefront_labels` as key → text. A key
 * the owner never set keeps each component's own wording, so templates that
 * phrase a label differently ("Your Cart" vs "Cart") stay as designed until
 * the owner types their own.
 */

import { z } from 'zod'

export type LabelScreen = 'menu' | 'item' | 'cart' | 'checkout' | 'confirmation' | 'tracking' | 'loyalty'

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
    'tracking.received': { screen: 'tracking', label: 'Received — step name', example: 'Order received', maxLength: SHORT },
    'tracking.received_headline': { screen: 'tracking', label: 'Received — headline', example: 'We got your order!', maxLength: MEDIUM },
    'tracking.received_detail': { screen: 'tracking', label: 'Received — detail', example: 'Waiting for the store to confirm.', maxLength: LONG },
    'tracking.confirmed': { screen: 'tracking', label: 'Confirmed — step name', example: 'Confirmed', maxLength: SHORT },
    'tracking.confirmed_headline': { screen: 'tracking', label: 'Confirmed — headline', example: 'Order confirmed', maxLength: MEDIUM },
    'tracking.confirmed_detail': { screen: 'tracking', label: 'Confirmed — detail', example: 'The store accepted your order.', maxLength: LONG },
    'tracking.preparing': { screen: 'tracking', label: 'Preparing — step name', example: 'Preparing', maxLength: SHORT },
    'tracking.preparing_headline': { screen: 'tracking', label: 'Preparing — headline', example: 'Cooking up your order', maxLength: MEDIUM },
    'tracking.preparing_detail': { screen: 'tracking', label: 'Preparing — detail', example: 'Your food is being prepared right now.', maxLength: LONG },
    'tracking.ready': { screen: 'tracking', label: 'Ready — step name', example: 'Ready', maxLength: SHORT },
    'tracking.ready_headline': { screen: 'tracking', label: 'Ready — headline', example: 'Your order is ready!', maxLength: MEDIUM },
    'tracking.ready_detail': { screen: 'tracking', label: 'Ready — detail', example: 'Ready for pickup or on its way.', maxLength: LONG },
    'tracking.completed': { screen: 'tracking', label: 'Completed — step name', example: 'Completed', maxLength: SHORT },
    'tracking.completed_headline': { screen: 'tracking', label: 'Completed — headline', example: 'Enjoy your meal!', maxLength: MEDIUM },
    'tracking.completed_detail': { screen: 'tracking', label: 'Completed — detail', example: 'Order complete. Thanks for ordering!', maxLength: LONG },
    'tracking.cancelled_headline': { screen: 'tracking', label: 'Cancelled — headline', example: 'Order cancelled', maxLength: MEDIUM },
    'tracking.cancelled_detail': { screen: 'tracking', label: 'Cancelled — detail', example: 'This order has been cancelled.', maxLength: LONG },
    'tracking.ring_me': { screen: 'tracking', label: '"Ring me" button', example: 'Ring me when my order is ready', maxLength: MEDIUM },
    'tracking.ring_armed': { screen: 'tracking', label: '"Ring me" — after tapping', example: "We'll ring & vibrate when it's ready", maxLength: MEDIUM },
    'tracking.progress_title': { screen: 'tracking', label: 'Progress title', example: 'Progress', maxLength: SHORT },
    'tracking.summary_title': { screen: 'tracking', label: 'Order summary title', example: 'Your order', maxLength: SHORT },
    'tracking.back': { screen: 'tracking', label: 'Back to menu', example: 'Back to menu', maxLength: SHORT },
    'loyalty.claim_title': { screen: 'loyalty', label: 'Claim title', example: 'Claim your stamp for this order', maxLength: MEDIUM },
    'loyalty.number_label': { screen: 'loyalty', label: 'Number box label', example: 'Mobile number', maxLength: SHORT },
    'loyalty.claim_button': { screen: 'loyalty', label: 'Claim button', example: 'Claim my stamp', maxLength: SHORT },
    'loyalty.privacy': { screen: 'loyalty', label: 'Privacy note', example: 'Only used for your rewards and order updates. No spam.', maxLength: LONG },
    'loyalty.collected': { screen: 'loyalty', label: 'Stamp collected', example: 'Stamp collected!', maxLength: MEDIUM },
    'loyalty.reward_ready': { screen: 'loyalty', label: 'Reward ready', example: 'Reward ready!', maxLength: MEDIUM },
    'loyalty.progress_title': { screen: 'loyalty', label: 'Progress title', example: 'Your reward progress', maxLength: MEDIUM },
    'loyalty.awaiting': { screen: 'loyalty', label: 'Stamp on the way', example: 'Your stamp is on the way', maxLength: MEDIUM },
    'loyalty.keep_using': { screen: 'loyalty', label: 'How stamps add up', example: 'Use the same number when you order and your stamps add up automatically.', maxLength: LONG },
    'loyalty.view_rewards': { screen: 'loyalty', label: 'View rewards link', example: 'View rewards & use a reward', maxLength: MEDIUM },
    'loyalty.wallet_title': { screen: 'loyalty', label: 'Save to phone title', example: 'Save your card to your phone', maxLength: MEDIUM },
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
