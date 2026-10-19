/**
 * The sample order the Branding Studio shows on the "Order status" and
 * "Loyalty card" screens. The real page needs a real order and its tracking
 * token, so the Studio opens `/[tenant]/order/studio-preview` instead and the
 * page renders this sample (nothing is read from orders). The owner switches
 * what the sample shows from the "Show" bar under the preview; the choice
 * travels with the draft under `__trackingPreview`.
 */

import type { LoyaltyOffer } from '@/lib/loyalty/offer'
import type { OrderStampCard } from '@/lib/loyalty/stamp-status'
import type { StampCardView } from '@/lib/loyalty/stamp-card-view'
import type { TrackingData } from '@/lib/order-tracking-service'

export const TRACKING_PREVIEW_ORDER_ID = 'studio-preview'
/**
 * The Studio's preview query param (= BRANDING_PREVIEW_PARAM). Repeated here
 * because that one lives in a 'use client' module, and a Server Component that
 * imports a value from one gets a client reference, not the string.
 */
export const STUDIO_PREVIEW_PARAM = 'brandingPreview'
export const TRACKING_PREVIEW_KEY = '__trackingPreview'

export const TRACKING_PREVIEW_STATUSES = [
    { id: 'pending', label: 'Received' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'preparing', label: 'Preparing' },
    { id: 'ready', label: 'Ready' },
    { id: 'delivered', label: 'Completed' },
    { id: 'cancelled', label: 'Cancelled' },
] as const

export const LOYALTY_PREVIEW_VIEWS = [
    { id: 'join', label: 'Join prompt' },
    { id: 'collecting', label: 'Collecting' },
    { id: 'reward', label: 'Reward ready' },
    { id: 'awaiting', label: 'Stamp on the way' },
    { id: 'points', label: 'Points card' },
    { id: 'none', label: 'No card' },
] as const

export const TRACKING_PREVIEW_EXTRAS = [
    { id: 'scheduled', label: 'Scheduled' },
    { id: 'pickup', label: 'Pickup code' },
    { id: 'armed', label: '"Ring me" on' },
    { id: 'alert', label: 'Ready alert' },
] as const

export type TrackingPreviewStatus = (typeof TRACKING_PREVIEW_STATUSES)[number]['id']
export type LoyaltyPreviewView = (typeof LOYALTY_PREVIEW_VIEWS)[number]['id']
export type TrackingPreviewExtra = (typeof TRACKING_PREVIEW_EXTRAS)[number]['id']

export interface TrackingPreviewState {
    status: TrackingPreviewStatus
    loyalty: LoyaltyPreviewView
    extras: readonly TrackingPreviewExtra[]
}

export const DEFAULT_TRACKING_PREVIEW: TrackingPreviewState = { status: 'preparing', loyalty: 'collecting', extras: [] }

type Adjust = (state: TrackingPreviewState) => TrackingPreviewState

const withExtra = (extra: TrackingPreviewExtra): Adjust => (state) =>
    state.extras.includes(extra) ? state : { ...state, extras: [...state.extras, extra] }
const withStatus = (status: TrackingPreviewStatus): Adjust => (state) => ({ ...state, status })
const withLoyalty = (loyalty: LoyaltyPreviewView): Adjust => (state) => ({ ...state, loyalty })
/** The loyalty card on screen (any face but "No card"). */
const withCard: Adjust = (state) => (state.loyalty === 'none' ? { ...state, loyalty: 'collecting' } : state)
/** An order still in the kitchen (the "Ring me" button and the timeline show). */
const inProgress: Adjust = (state) =>
    state.status === 'pending' || state.status === 'confirmed' || state.status === 'preparing' ? state : { ...state, status: 'preparing' }

/**
 * Settings that only show in some states of the sample, and what the preview
 * switches to while the owner edits them — so every change is visible.
 */
const FIELD_STATES: ReadonlyArray<[RegExp, Adjust]> = [
    [/^tracking_style\.pickup_/, withExtra('pickup')],
    [/^tracking_style\.alert_/, withExtra('alert')],
    [/^tracking_style\.ring_armed$|^storefront_labels\.tracking\.ring_armed$/, (state) => withExtra('armed')(inProgress(state))],
    [/^tracking_style\.ring_|^storefront_labels\.tracking\.ring_me$/, inProgress],
    [/^tracking_style\.(timeline_|show_timeline$)|^storefront_labels\.tracking\.progress_title$/, inProgress],
    [/^tracking_style\.cancelled_color$|^storefront_labels\.tracking\.cancelled_/, withStatus('cancelled')],
    [/^storefront_labels\.tracking\.received/, withStatus('pending')],
    [/^storefront_labels\.tracking\.confirmed/, withStatus('confirmed')],
    [/^storefront_labels\.tracking\.preparing/, withStatus('preparing')],
    [/^storefront_labels\.tracking\.ready/, withStatus('ready')],
    [/^storefront_labels\.tracking\.completed/, withStatus('delivered')],
    [/^tracking_style\.input_background$|^storefront_labels\.loyalty\.(claim_|number_label|privacy)/, withLoyalty('join')],
    [/^storefront_labels\.loyalty\.awaiting$/, withLoyalty('awaiting')],
    [/^storefront_labels\.loyalty\.reward_ready$|^tracking_style\.confetti$/, withLoyalty('reward')],
    [/^storefront_labels\.loyalty\.(collected|progress_title|keep_using|view_rewards|wallet_title)$|^tracking_style\.wallet_background$/, withLoyalty('collecting')],
    [/^tracking_style\.(loyalty_|band_|stamp_|loyalty_position$)/, withCard],
]

/** The sample as the owner picked it, adjusted so the settings in focus are on screen. */
export function focusTrackingPreview(state: TrackingPreviewState, fieldIds: readonly string[]): TrackingPreviewState {
    return fieldIds.reduce(
        (current, fieldId) => FIELD_STATES.filter(([pattern]) => pattern.test(fieldId)).reduce((next, [, adjust]) => adjust(next), current),
        state
    )
}

function oneOf<T extends string>(value: unknown, options: readonly { id: T }[], fallback: T): T {
    return typeof value === 'string' && options.some((option) => option.id === value) ? (value as T) : fallback
}

/** Untrusted draft meta → a preview state. */
export function parseTrackingPreview(value: unknown): TrackingPreviewState {
    const raw = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
    const extras = Array.isArray(raw.extras)
        ? TRACKING_PREVIEW_EXTRAS.map((extra) => extra.id).filter((id) => (raw.extras as unknown[]).includes(id))
        : []
    return {
        status: oneOf(raw.status, TRACKING_PREVIEW_STATUSES, DEFAULT_TRACKING_PREVIEW.status),
        loyalty: oneOf(raw.loyalty, LOYALTY_PREVIEW_VIEWS, DEFAULT_TRACKING_PREVIEW.loyalty),
        extras,
    }
}

/** A fixed clock so the server HTML and the hydrated page agree. */
export const PREVIEW_NOW_MS = Date.UTC(2026, 0, 15, 4, 30)
const PREP_MINUTES = 12
const MINUTE_MS = 60_000

const SAMPLE_ITEMS: TrackingData['items'] = [
    { name: 'Chicken Inasal', quantity: 2, price: 165, subtotal: 330, variation: 'Paa', addons: ['Extra rice'] },
    { name: 'Iced Calamansi', quantity: 1, price: 65, subtotal: 65 },
]

const TERMINAL: ReadonlySet<TrackingPreviewStatus> = new Set(['delivered', 'cancelled'])

/** The sample order, in the state the owner picked. Dishes come from the menu when it has any. */
export function sampleTrackingData(state: TrackingPreviewState, items: TrackingData['items'] = SAMPLE_ITEMS): TrackingData {
    const hasExtra = (extra: TrackingPreviewExtra) => state.extras.includes(extra)
    const lines = items.length > 0 ? items : SAMPLE_ITEMS
    return {
        status: state.status,
        items: lines,
        total: lines.reduce((sum, line) => sum + line.subtotal, 0) + 49,
        deliveryFee: 49,
        orderType: hasExtra('pickup') ? 'Pickup' : 'Delivery',
        orderTypeKind: hasExtra('pickup') ? 'pickup' : 'delivery',
        pickupScanEnabled: true,
        customerName: 'Maria',
        hasContact: state.loyalty !== 'join',
        dailyNumber: 7,
        createdAt: new Date(PREVIEW_NOW_MS - 6 * MINUTE_MS).toISOString(),
        isTerminal: TERMINAL.has(state.status),
        scheduledLabel: hasExtra('scheduled') ? 'Today, 6:30 PM' : null,
        promisedReadyAt: new Date(PREVIEW_NOW_MS + PREP_MINUTES * MINUTE_MS).toISOString(),
        serverNowMs: PREVIEW_NOW_MS,
    }
}

const SAMPLE_OFFER: LoyaltyOffer = {
    programName: 'Suki Card',
    earnMode: 'stamp',
    threshold: 8,
    rewardLabel: 'Free drink',
    minSpend: null,
    rewardSteps: [
        { at: 4, label: 'Free drink', emoji: '🥤', imageUrl: null, isFinal: false },
        { at: 8, label: 'Free meal', emoji: '🍗', imageUrl: null, isFinal: true },
    ],
}

/** The store's own offer when it runs one, so the owner styles their real card. */
export function sampleOffer(real: LoyaltyOffer | null, view: LoyaltyPreviewView): LoyaltyOffer {
    const offer = real ?? SAMPLE_OFFER
    if (view !== 'points' || offer.earnMode === 'points') return offer
    return { ...offer, earnMode: 'points', threshold: 100, rewardSteps: offer.rewardSteps?.map((step) => ({ ...step, at: Math.round((step.at / offer.threshold) * 100) })) }
}

/** The card the sample customer holds (null for the join prompt). */
export function sampleStampCard(offer: LoyaltyOffer, view: LoyaltyPreviewView): OrderStampCard | null {
    if (view !== 'collecting' && view !== 'reward' && view !== 'points') return null
    const isReward = view === 'reward'
    return {
        earnedOnOrder: true,
        programName: offer.programName,
        programStatus: 'active',
        earnMode: offer.earnMode,
        balance: isReward ? 1 : Math.max(1, Math.floor(offer.threshold * 0.6)),
        threshold: offer.threshold,
        rewardsAvailable: isReward ? 1 : 0,
        rewardLabel: offer.rewardLabel,
        rewardSteps: offer.rewardSteps,
    }
}

/** Which face of the loyalty card the sample shows. */
export function sampleStampView(view: LoyaltyPreviewView): Exclude<StampCardView, 'hidden'> | null {
    if (view === 'none') return null
    if (view === 'join') return 'claim'
    if (view === 'awaiting') return 'awaiting'
    return 'card'
}

const SAMPLE_QUANTITIES = [2, 1] as const

/** The sample order's lines from the store's own dishes (first two that are on sale), else the stock sample. */
export function previewItemsFrom(menu: readonly { name: string; price: number; is_available?: boolean }[]): TrackingData['items'] {
    const dishes = menu.filter((dish) => dish.is_available !== false && dish.price > 0).slice(0, SAMPLE_QUANTITIES.length)
    if (dishes.length === 0) return SAMPLE_ITEMS
    return dishes.map((dish, index) => ({
        name: dish.name,
        quantity: SAMPLE_QUANTITIES[index],
        price: dish.price,
        subtotal: dish.price * SAMPLE_QUANTITIES[index],
    }))
}
