// ---------------------------------------------------------------------------
// Block colours on the checkout and thank-you pages.
//
// Both pages paint from the store's checkout colours (`checkout_*_color`,
// resolved by getCheckoutPalette into `--co-*`). A block's own colour knob
// (`color_accent`, `color_card`…) is applied by handing that block a copy of
// the store row with the knob in place of the column, so every derived shade
// (soft wash, border tint, readable text on the button) follows exactly as
// it would for a store-wide change — and blank knobs change nothing.
// ---------------------------------------------------------------------------

import { getTenantBranding, type BrandingColors } from '@/lib/branding-utils'

import { colorKnob, isKnobColor } from './knobs'
import type { BlockOption } from './types'

/** Knob key → the checkout column it stands in for, within one block. */
export const CHECKOUT_COLOR_COLUMNS = {
  color_accent: 'checkout_accent_color',
  color_card: 'checkout_card_background_color',
  color_summary: 'checkout_summary_background_color',
  color_text: 'checkout_text_color',
  color_muted: 'checkout_muted_text_color',
  color_border: 'checkout_border_color',
  color_button: 'checkout_button_color',
  color_button_text: 'checkout_button_text_color',
} as const

export type CheckoutColorKnob = keyof typeof CHECKOUT_COLOR_COLUMNS

const KNOB_LABELS: Record<CheckoutColorKnob, { label: string; follows: string }> = {
  color_accent: { label: 'Highlight', follows: 'Accent' },
  color_card: { label: 'Card', follows: 'Card background' },
  color_summary: { label: 'Card', follows: 'Summary background' },
  color_text: { label: 'Text', follows: 'Text' },
  color_muted: { label: 'Soft text', follows: 'Muted text' },
  color_border: { label: 'Borders', follows: 'Border' },
  color_button: { label: 'Button', follows: 'Button' },
  color_button_text: { label: 'Button text', follows: 'Button text' },
}

/** The colour knobs a checkout block offers, labelled the same everywhere. */
export function checkoutColorKnobs(keys: readonly CheckoutColorKnob[], labels: Partial<Record<CheckoutColorKnob, string>> = {}): BlockOption[] {
  return keys.map((key) => colorKnob(key, labels[key] ?? KNOB_LABELS[key].label, KNOB_LABELS[key].follows))
}

type Option = (key: string) => string | boolean | undefined

/** The block's set colours as checkout column values ({} when none are set). */
export function checkoutColorOverrides(option: Option): Record<string, string> {
  const overrides: Record<string, string> = {}
  for (const [knob, column] of Object.entries(CHECKOUT_COLOR_COLUMNS)) {
    const value = option(knob)
    if (isKnobColor(value)) overrides[column] = value
  }
  return overrides
}

interface Themable {
  tenant: Record<string, unknown> | null | undefined
  branding: BrandingColors | null | undefined
}

/**
 * `source` (a useCheckout() value, or the thank-you page's store row +
 * branding) with the block's colours in place of the store's. Returns
 * `source` itself when the block sets no colour.
 */
export function withCheckoutColors<T extends Themable>(source: T, option: Option): T {
  const overrides = checkoutColorOverrides(option)
  if (!Object.keys(overrides).length) return source
  const accent = overrides.checkout_accent_color
  return {
    ...source,
    tenant: { ...(source.tenant ?? {}), ...overrides },
    // The accent is read from the resolved branding (getTenantBranding), not the row.
    branding: accent ? { ...(source.branding ?? getTenantBranding(null)), checkoutAccent: accent } : source.branding,
  }
}
