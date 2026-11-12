/**
 * The payment step's colours: the owner's `payment_step_style` colours over the
 * checkout palette. Nothing set = exactly the pre-2026-11-12 step (the band and
 * the Send button both in the checkout button colour, text in the checkout's
 * accent text colour). A colour the owner set without its text partner gets a
 * readable text colour, never the checkout's (which was chosen for another
 * background).
 */

import type { CSSProperties } from 'react'
import { getContrastColor, setAlpha } from '@/lib/branding-utils'
import type { PaymentStepStyle } from '@/lib/payment-step/style'

/** What the step reads from `getCheckoutPalette`. */
export interface PaymentStepPaletteInput {
    accent: string
    accentText: string
    button?: string | null
}

export interface PaymentStepColors {
    band: string
    bandText: string
    button: string
    buttonText: string
    accent: string
    accentText: string
    /** Set only when the owner chose an accent: the `--co-accent*` overrides for the step's root. */
    accentVars: CSSProperties | null
}

const ACCENT_BORDER_ALPHA = 0.4
const ACCENT_SOFT_ALPHA = 0.12

export function resolvePaymentStepColors(palette: PaymentStepPaletteInput, style: Pick<PaymentStepStyle, 'colors'>): PaymentStepColors {
    const { colors } = style
    const checkoutButton = palette.button || palette.accent

    const band = colors.band_color ?? checkoutButton
    const bandText = colors.band_text ?? (colors.band_color ? getContrastColor(colors.band_color) : palette.accentText)
    const button = colors.button_color ?? checkoutButton
    const buttonText = colors.button_text ?? (colors.button_color ? getContrastColor(colors.button_color) : palette.accentText)
    const accent = colors.accent ?? palette.accent
    const accentText = colors.accent ? getContrastColor(colors.accent) : palette.accentText

    const accentVars = colors.accent
        ? ({
              '--co-accent': accent,
              '--co-accent-text': accentText,
              '--co-accent-border': setAlpha(accent, ACCENT_BORDER_ALPHA),
              '--co-accent-soft': setAlpha(accent, ACCENT_SOFT_ALPHA),
          } as CSSProperties)
        : null

    return { band, bandText, button, buttonText, accent, accentText, accentVars }
}
