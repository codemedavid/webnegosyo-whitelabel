// ---------------------------------------------------------------------------
// The "How to order" block's copy. Blank merchant values fall back to these,
// so a template or a freshly added block never shows an empty tile.
// ---------------------------------------------------------------------------

import type { EntryMode, OrderEntryContent } from './types'

export interface EntryOption {
  mode: EntryMode
  label: string
  blurb: string
  icon: string
}

export const ENTRY_DEFAULTS: Record<EntryMode, Omit<EntryOption, 'mode'>> = {
  dine_in: { label: 'Dine in', blurb: 'Eat with us', icon: 'UtensilsCrossed' },
  pickup: { label: 'Pickup', blurb: 'Collect in store', icon: 'ShoppingBag' },
  delivery: { label: 'Delivery', blurb: 'Straight to you', icon: 'Bike' },
}

export const DEFAULT_ENTRY_CTA = 'Start ordering'

function pick(record: unknown, mode: EntryMode): string {
  if (!record || typeof record !== 'object') return ''
  const value = Object.prototype.hasOwnProperty.call(record, mode) ? (record as Record<string, unknown>)[mode] : ''
  return typeof value === 'string' ? value.trim() : ''
}

/** One tile's label, blurb and icon after the merchant's overrides. */
export function resolveEntryOption(content: Pick<OrderEntryContent, 'labels' | 'blurbs' | 'icons'>, mode: EntryMode): EntryOption {
  const fallback = ENTRY_DEFAULTS[mode]
  return {
    mode,
    label: pick(content.labels, mode) || fallback.label,
    blurb: pick(content.blurbs, mode) || fallback.blurb,
    icon: pick(content.icons, mode) || fallback.icon,
  }
}

/** The start button's label; blank falls back to the default. */
export function resolveEntryCtaLabel(content: Pick<OrderEntryContent, 'ctaLabel'>): string {
  return (typeof content.ctaLabel === 'string' ? content.ctaLabel.trim() : '') || DEFAULT_ENTRY_CTA
}

/**
 * What the block draws. Tiles and the list need at least one order type to
 * offer; with none available (or while they load) it becomes the start
 * button, so a customer is never left without a way in.
 */
export function resolveEntryLayout(content: Pick<OrderEntryContent, 'layout'>, modeCount: number): OrderEntryContent['layout'] {
  if (content.layout === 'cta') return 'cta'
  if (modeCount === 0) return 'cta'
  return content.layout === 'list' ? 'list' : 'tiles'
}
