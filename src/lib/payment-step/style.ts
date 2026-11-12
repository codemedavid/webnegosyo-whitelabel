/**
 * The owner's look for the checkout's payment step (the screen after "Proceed
 * to Payment": amount, QR / account details, the receipt upload, Send order),
 * stored in `tenants.payment_step_style` as a flat key → value object and
 * edited in the Branding Studio's "Payment step" screen (and the Page
 * Designer's checkout Look tab, which reuses the Studio registry).
 *
 * - An empty object is exactly the pre-2026-11-12 step: a bottom sheet, the
 *   dashed upload box, a brand-coloured band. `DEFAULT_PAYMENT_STEP_OPTIONS`
 *   is that look and a test pins it.
 * - A colour left out follows the checkout palette.
 * - The column is untrusted input: `readPaymentStepStyle` keeps only known
 *   keys with valid values (colours are strict hex because they go into
 *   inline styles; the example image is https only).
 *
 * Pure: read by the checkout, the Studio and the Page Designer alike.
 */

import { z } from 'zod'

export const PAYMENT_STEP_CHOICES = {
    /**
     * How the step opens: bottom sheet (phones) / card (wider screens), a card
     * in the middle, a full-screen panel over the checkout, or a screen of its
     * own that replaces the checkout form (the phone's Back button returns).
     */
    layout: { options: ['sheet', 'popup', 'fullscreen', 'screen'], default: 'sheet' },
    /** How the receipt upload looks. */
    upload_design: { options: ['classic', 'button', 'steps', 'compact', 'reference'], default: 'classic' },
    /** The top of the step: a brand-coloured band, or plain on the card colour. */
    header_style: { options: ['band', 'plain'], default: 'band' },
} as const

export const PAYMENT_STEP_TOGGLES = {
    /** The "Order breakdown" disclosure under the amount. */
    show_breakdown: true,
} as const

export const PAYMENT_STEP_COLOR_KEYS = ['band_color', 'band_text', 'button_color', 'button_text', 'accent'] as const

/** An example receipt picture the owner can show above the upload. */
export const PAYMENT_STEP_IMAGE_KEYS = ['sample_image'] as const

export type PaymentStepColorKey = (typeof PAYMENT_STEP_COLOR_KEYS)[number]
export type PaymentStepChoiceKey = keyof typeof PAYMENT_STEP_CHOICES
export type PaymentStepToggleKey = keyof typeof PAYMENT_STEP_TOGGLES

export type PaymentStepOptions = {
    [K in PaymentStepChoiceKey]: (typeof PAYMENT_STEP_CHOICES)[K]['options'][number]
} & {
    [K in PaymentStepToggleKey]: boolean
}

export type PaymentStepLayout = PaymentStepOptions['layout']
export type PaymentUploadDesign = PaymentStepOptions['upload_design']

export const DEFAULT_PAYMENT_STEP_OPTIONS: PaymentStepOptions = {
    ...(Object.fromEntries(Object.entries(PAYMENT_STEP_CHOICES).map(([key, choice]) => [key, choice.default])) as {
        [K in PaymentStepChoiceKey]: PaymentStepOptions[K]
    }),
    ...PAYMENT_STEP_TOGGLES,
}

export const PAYMENT_STEP_STYLE_KEYS: readonly string[] = [
    ...PAYMENT_STEP_COLOR_KEYS,
    ...Object.keys(PAYMENT_STEP_CHOICES),
    ...Object.keys(PAYMENT_STEP_TOGGLES),
    ...PAYMENT_STEP_IMAGE_KEYS,
]

export interface PaymentStepStyle {
    /** Only the colours the owner chose (strict six-digit hex, lower case). */
    colors: Partial<Record<PaymentStepColorKey, string>>
    options: PaymentStepOptions
    /** The example receipt picture, or null. */
    sampleImage: string | null
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export const MAX_SAMPLE_IMAGE_URL_LENGTH = 600

/** An https picture URL with no credentials, within the length cap. */
export function isSafeSampleImageUrl(value: string): boolean {
    if (value.length > MAX_SAMPLE_IMAGE_URL_LENGTH) return false
    try {
        const url = new URL(value)
        return url.protocol === 'https:' && url.username === '' && url.password === ''
    } catch {
        return false
    }
}

const hexColor = z.string().regex(HEX_COLOR, 'Use a hex colour like #E4572E')
const sampleImage = z.string().trim().refine(isSafeSampleImageUrl, 'Use an https picture link')

/** Write-side validation: known keys only, hex colours, listed choices, booleans, an https picture. */
export const paymentStepStyleSchema = z.object({
    ...Object.fromEntries(PAYMENT_STEP_COLOR_KEYS.map((key) => [key, hexColor.optional()])),
    ...Object.fromEntries(
        Object.entries(PAYMENT_STEP_CHOICES).map(([key, choice]) => [key, z.enum(choice.options as unknown as [string, ...string[]]).optional()])
    ),
    ...Object.fromEntries(Object.keys(PAYMENT_STEP_TOGGLES).map((key) => [key, z.boolean().optional()])),
    sample_image: sampleImage.optional(),
}).strict()

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownValue(raw: Record<string, unknown>, key: string): unknown {
    return Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined
}

function normalizeHex(color: string): string {
    const lower = color.toLowerCase()
    return lower.length === 4 ? `#${lower.slice(1).split('').map((c) => c + c).join('')}` : lower
}

/** The owner's payment step look from a tenant row (with today's look for anything unset or invalid). */
export function readPaymentStepStyle(tenant: Readonly<Record<string, unknown>> | null | undefined): PaymentStepStyle {
    const raw = tenant?.payment_step_style
    const bag = isPlainObject(raw) ? raw : {}

    const options: Record<string, string | boolean> = { ...DEFAULT_PAYMENT_STEP_OPTIONS }
    for (const [key, choice] of Object.entries(PAYMENT_STEP_CHOICES)) {
        const value = ownValue(bag, key)
        if (typeof value === 'string' && (choice.options as readonly string[]).includes(value)) options[key] = value
    }
    for (const key of Object.keys(PAYMENT_STEP_TOGGLES)) {
        const value = ownValue(bag, key)
        if (typeof value === 'boolean') options[key] = value
    }

    const colors: Partial<Record<PaymentStepColorKey, string>> = {}
    for (const key of PAYMENT_STEP_COLOR_KEYS) {
        const value = ownValue(bag, key)
        if (typeof value === 'string' && HEX_COLOR.test(value)) colors[key] = normalizeHex(value)
    }

    const image = ownValue(bag, 'sample_image')
    const sample = typeof image === 'string' && isSafeSampleImageUrl(image.trim()) ? image.trim() : null

    return { colors, options: options as PaymentStepOptions, sampleImage: sample }
}

/** Layouts that sit over the checkout like a page and answer the phone's Back button. */
export function isPageLikeLayout(layout: PaymentStepLayout): boolean {
    return layout === 'fullscreen' || layout === 'screen'
}
