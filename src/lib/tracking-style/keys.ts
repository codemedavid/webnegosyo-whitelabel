/**
 * The owner's look for the order-tracking page and the loyalty stamp card,
 * stored in `tenants.tracking_style` as a flat key → value object (edited in
 * the Branding Studio's "Order status" and "Loyalty card" screens).
 *
 * - A colour key left out follows the store's brand exactly as before, so a
 *   store that never opens these screens looks the same as it always did.
 * - A choice or switch left out takes its default (today's look).
 *
 * Pure and dependency-light: read by Server Components, the client page and
 * the Studio alike. The column is untrusted input — `readTrackingStyle` keeps
 * only known keys with valid values, and every colour is a strict hex because
 * it is written into inline styles.
 */

import { z } from 'zod'

export const TRACKING_COLOR_KEYS = [
    // Page
    'page_background', 'page_glow_color', 'card_background', 'card_border', 'text', 'muted_text', 'accent',
    // Header
    'header_background', 'header_text', 'live_badge',
    // Status banner
    'hero_color', 'hero_color_end', 'hero_text', 'hero_bar', 'cancelled_color',
    // "Ring me" button
    'ring_background', 'ring_text', 'ring_border', 'ring_armed',
    // Progress timeline
    'timeline_done', 'timeline_current', 'timeline_upcoming',
    // Order summary
    'summary_total', 'summary_badge',
    // Pickup code
    'pickup_background', 'pickup_border', 'pickup_text', 'pickup_ready',
    // "Order ready" alert
    'alert_background', 'alert_text', 'alert_button', 'alert_button_text',
    // Loyalty card
    'loyalty_background', 'loyalty_border', 'loyalty_text', 'loyalty_muted_text', 'input_background',
    'band_color', 'band_color_end', 'band_text',
    'stamp_color', 'stamp_mark', 'stamp_empty', 'stamp_next', 'stamp_badge', 'stamp_reached',
    'loyalty_button', 'loyalty_button_text', 'loyalty_link', 'wallet_background',
] as const

export type TrackingColorKey = (typeof TRACKING_COLOR_KEYS)[number]

export const TRACKING_CHOICES = {
    /** The status banner: brand gradient, flat colour, light tint, or an outlined card. */
    hero_style: { options: ['gradient', 'solid', 'soft', 'outline'], default: 'gradient' },
    /** How round every card on the page is. */
    corners: { options: ['rounded', 'soft', 'square'], default: 'rounded' },
    /** Where the loyalty card sits: right under the status, or after the receipt. */
    loyalty_position: { options: ['top', 'bottom'], default: 'top' },
    /** The loyalty card's top band. */
    band_style: { options: ['gradient', 'solid', 'soft', 'plain'], default: 'gradient' },
    stamp_shape: { options: ['circle', 'rounded', 'square'], default: 'circle' },
    /** What an earned stamp shows: the store's logo (when it has one) or a tick. */
    stamp_fill: { options: ['logo', 'check'], default: 'logo' },
} as const

export const TRACKING_TOGGLES = {
    show_glow: true,
    show_live_badge: true,
    show_timeline: true,
    confetti: true,
} as const

export type TrackingChoiceKey = keyof typeof TRACKING_CHOICES
export type TrackingToggleKey = keyof typeof TRACKING_TOGGLES

export type TrackingOptions = {
    [K in TrackingChoiceKey]: (typeof TRACKING_CHOICES)[K]['options'][number]
} & {
    [K in TrackingToggleKey]: boolean
}

export const DEFAULT_TRACKING_OPTIONS: TrackingOptions = {
    ...(Object.fromEntries(Object.entries(TRACKING_CHOICES).map(([key, choice]) => [key, choice.default])) as {
        [K in TrackingChoiceKey]: TrackingOptions[K]
    }),
    ...TRACKING_TOGGLES,
}

export const TRACKING_STYLE_KEYS: readonly string[] = [
    ...TRACKING_COLOR_KEYS,
    ...Object.keys(TRACKING_CHOICES),
    ...Object.keys(TRACKING_TOGGLES),
]

export type TrackingColors = Partial<Record<TrackingColorKey, string>>

export interface TrackingStyle {
    /** Only the colours the owner chose. */
    colors: TrackingColors
    options: TrackingOptions
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

const hexColor = z.string().regex(HEX_COLOR, 'Use a hex colour like #E4572E')

/** Write-side validation: known keys only, hex colours, listed choices, booleans. */
export const trackingStyleSchema = z.object({
    ...Object.fromEntries(TRACKING_COLOR_KEYS.map((key) => [key, hexColor.optional()])),
    ...Object.fromEntries(
        Object.entries(TRACKING_CHOICES).map(([key, choice]) => [key, z.enum(choice.options as unknown as [string, ...string[]]).optional()])
    ),
    ...Object.fromEntries(Object.keys(TRACKING_TOGGLES).map((key) => [key, z.boolean().optional()])),
}).strict()

/** `#abc` → `#aabbcc`, lower-cased; the colour helpers expect six digits. */
export function normalizeHex(color: string): string {
    const lower = color.toLowerCase()
    return lower.length === 4 ? `#${lower.slice(1).split('').map((c) => c + c).join('')}` : lower
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownValue(raw: Record<string, unknown>, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined
}

function readOptions(raw: Record<string, unknown>): TrackingOptions {
    const options: Record<string, string | boolean> = { ...DEFAULT_TRACKING_OPTIONS }
    for (const [key, choice] of Object.entries(TRACKING_CHOICES)) {
        const value = ownValue(raw, key)
        if (typeof value === 'string' && (choice.options as readonly string[]).includes(value)) options[key] = value
    }
    for (const key of Object.keys(TRACKING_TOGGLES)) {
        const value = ownValue(raw, key)
        if (typeof value === 'boolean') options[key] = value
    }
    return options as TrackingOptions
}

/** The owner's tracking look from a tenant row. Untrusted input: bad values are dropped. */
export function readTrackingStyle(tenant: Record<string, unknown> | null | undefined): TrackingStyle {
    const raw = tenant?.tracking_style
    if (!isPlainObject(raw)) return { colors: {}, options: { ...DEFAULT_TRACKING_OPTIONS } }
    const colors: TrackingColors = {}
    for (const key of TRACKING_COLOR_KEYS) {
        const value = ownValue(raw, key)
        if (typeof value === 'string' && HEX_COLOR.test(value)) colors[key] = normalizeHex(value)
    }
    return { colors, options: readOptions(raw) }
}
