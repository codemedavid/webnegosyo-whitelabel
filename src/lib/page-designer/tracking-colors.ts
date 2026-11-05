// ---------------------------------------------------------------------------
// Block colours and looks on the order-tracking page.
//
// The page paints from the store's `tracking_style` (Look tab / Branding
// Studio → Order status, Loyalty card), resolved into `--trk-*` variables.
// A block's own colour knob (`color_banner`, `color_done`…) or look choice
// (corners, banner style, stamp shape…) is applied by resolving the palette
// again with the knob in place of the store's value, and publishing only the
// variables that changed on a wrapper around that block. Derived shades
// (soft washes, readable text, the gradient's end) follow exactly as a
// store-wide change would, and blank knobs change nothing.
// ---------------------------------------------------------------------------

import type { CSSProperties } from 'react'

import type { BrandingColors } from '@/lib/branding-utils'
import {
  TRACKING_CHOICES,
  type TrackingChoiceKey,
  type TrackingColorKey,
  type TrackingColors,
  type TrackingOptions,
  type TrackingStyle,
} from '@/lib/tracking-style/keys'
import { buildTrackingTheme } from '@/components/customer/order-tracking/tracking-theme'

import { choiceKnob, colorKnob, isKnobColor } from './knobs'
import type { BlockOption } from './types'

/** Knob key → the `tracking_style` colour it stands in for, within one block. */
export const TRACKING_COLOR_KNOBS = {
  color_accent: 'accent',
  color_card: 'card_background',
  color_border: 'card_border',
  color_text: 'text',
  color_muted: 'muted_text',
  color_header: 'header_background',
  color_header_text: 'header_text',
  color_live: 'live_badge',
  color_banner: 'hero_color',
  color_banner_end: 'hero_color_end',
  color_banner_text: 'hero_text',
  color_bar: 'hero_bar',
  color_cancelled: 'cancelled_color',
  color_ring: 'ring_background',
  color_ring_text: 'ring_text',
  color_ring_border: 'ring_border',
  color_ring_armed: 'ring_armed',
  color_done: 'timeline_done',
  color_current: 'timeline_current',
  color_upcoming: 'timeline_upcoming',
  color_total: 'summary_total',
  color_badge: 'summary_badge',
  color_pickup: 'pickup_background',
  color_pickup_border: 'pickup_border',
  color_pickup_text: 'pickup_text',
  color_pickup_ready: 'pickup_ready',
  color_loyalty: 'loyalty_background',
  color_loyalty_border: 'loyalty_border',
  color_loyalty_text: 'loyalty_text',
  color_band: 'band_color',
  color_band_end: 'band_color_end',
  color_band_text: 'band_text',
  color_stamp: 'stamp_color',
  color_loyalty_button: 'loyalty_button',
  color_loyalty_button_text: 'loyalty_button_text',
} as const satisfies Record<`color_${string}`, TrackingColorKey>

export type TrackingColorKnob = keyof typeof TRACKING_COLOR_KNOBS

const KNOB_LABELS: Record<TrackingColorKnob, { label: string; follows: string }> = {
  color_accent: { label: 'Highlight', follows: 'Accent' },
  color_card: { label: 'Card', follows: 'Cards' },
  color_border: { label: 'Card border', follows: 'Card borders' },
  color_text: { label: 'Text', follows: 'Text' },
  color_muted: { label: 'Soft text', follows: 'Soft text' },
  color_header: { label: 'Background', follows: 'Header background' },
  color_header_text: { label: 'Store name', follows: 'Header text' },
  color_live: { label: '“Live” badge', follows: '“Live” badge' },
  color_banner: { label: 'Banner', follows: 'Status banner colour' },
  color_banner_end: { label: 'Second colour', follows: 'Status banner second colour' },
  color_banner_text: { label: 'Banner text', follows: 'Status banner text' },
  color_bar: { label: 'Progress bar', follows: 'Status banner progress bar' },
  color_cancelled: { label: 'Cancelled', follows: 'Cancelled colour' },
  color_ring: { label: 'Background', follows: 'Ring-me background' },
  color_ring_text: { label: 'Text', follows: 'Ring-me text' },
  color_ring_border: { label: 'Border', follows: 'Ring-me border' },
  color_ring_armed: { label: 'After tapping', follows: 'Ring-me after tapping' },
  color_done: { label: 'Done steps', follows: 'Timeline done steps' },
  color_current: { label: 'Current step', follows: 'Timeline current step' },
  color_upcoming: { label: 'Next steps', follows: 'Timeline next steps' },
  color_total: { label: 'Total', follows: 'Summary total' },
  color_badge: { label: 'Quantity badge', follows: 'Summary badge' },
  color_pickup: { label: 'Background', follows: 'Pickup code background' },
  color_pickup_border: { label: 'Border', follows: 'Pickup code border' },
  color_pickup_text: { label: 'Text', follows: 'Pickup code text' },
  color_pickup_ready: { label: 'When ready', follows: 'Pickup code ready' },
  color_loyalty: { label: 'Card', follows: 'Loyalty card background' },
  color_loyalty_border: { label: 'Card border', follows: 'Loyalty card border' },
  color_loyalty_text: { label: 'Text', follows: 'Loyalty card text' },
  color_band: { label: 'Top band', follows: 'Loyalty band colour' },
  color_band_end: { label: 'Band second colour', follows: 'Loyalty band second colour' },
  color_band_text: { label: 'Band text', follows: 'Loyalty band text' },
  color_stamp: { label: 'Stamps', follows: 'Stamp colour' },
  color_loyalty_button: { label: 'Button', follows: 'Loyalty button' },
  color_loyalty_button_text: { label: 'Button text', follows: 'Loyalty button text' },
}

type KnobExtra = Partial<Pick<BlockOption, 'group' | 'showWhen'>>

/** One tracking colour knob, labelled the same on every block. */
export function trackingColorKnob(key: TrackingColorKnob, extra: KnobExtra & { label?: string } = {}): BlockOption {
  const { label, ...rest } = extra
  return { ...colorKnob(key, label ?? KNOB_LABELS[key].label, KNOB_LABELS[key].follows), ...rest }
}

/** The colour knobs a tracking block offers. */
export function trackingColorKnobs(keys: readonly TrackingColorKnob[]): BlockOption[] {
  return keys.map((key) => trackingColorKnob(key))
}

/** "Same as the Look tab": a block choice that leaves the store-wide setting alone. */
export const FOLLOW_PAGE = 'page'

/** Card corners for one block; `page` keeps the page's corners (Look tab). */
export const TRACKING_CORNERS_KNOB: BlockOption = choiceKnob('corners', 'Corners', [
  { value: FOLLOW_PAGE, label: 'Same as page' },
  { value: 'rounded', label: 'Round' },
  { value: 'soft', label: 'Soft' },
  { value: 'square', label: 'Square' },
])

type Option = (key: string) => string | boolean | undefined

/** What a block changes about the page's look: colours and store-wide choices. */
export interface TrackingBlockLook {
  colors: TrackingColors
  options: Partial<TrackingOptions>
}

export const NO_BLOCK_LOOK: TrackingBlockLook = { colors: {}, options: {} }

/** The block's set colours as `tracking_style` colours ({} when none are set). */
export function trackingColorOverrides(option: Option): TrackingColors {
  const colors: TrackingColors = {}
  for (const [knob, key] of Object.entries(TRACKING_COLOR_KNOBS) as [TrackingColorKnob, TrackingColorKey][]) {
    const value = option(knob)
    if (isKnobColor(value)) colors[key] = value
  }
  return colors
}

/** A store-wide choice value, or undefined for `page` / anything the store setting does not offer. */
export function trackingChoice<K extends TrackingChoiceKey>(key: K, value: unknown): TrackingOptions[K] | undefined {
  if (typeof value !== 'string' || value === FOLLOW_PAGE) return undefined
  return (TRACKING_CHOICES[key].options as readonly string[]).includes(value) ? (value as TrackingOptions[K]) : undefined
}

/**
 * The block's look: its colour knobs, its `corners` knob, and any other
 * store-wide choices the block's design stands in for (e.g. the status
 * design → `hero_style`). Choices left undefined follow the page.
 */
export function blockTrackingLook(option: Option, choices: Partial<TrackingOptions> = {}): TrackingBlockLook {
  const wanted: [TrackingChoiceKey, unknown][] = [['corners', option('corners')], ...(Object.entries(choices) as [TrackingChoiceKey, unknown][])]
  const options = Object.fromEntries(
    wanted.map(([key, value]) => [key, trackingChoice(key, value)] as const).filter(([, value]) => value !== undefined),
  ) as Partial<TrackingOptions>
  return { colors: trackingColorOverrides(option), options }
}

export function isEmptyLook(look: TrackingBlockLook): boolean {
  return Object.keys(look.colors).length === 0 && Object.keys(look.options).length === 0
}

/** The store's look with the block's in place (a new object; `style` is untouched). */
export function withBlockLook(style: TrackingStyle, look: TrackingBlockLook): TrackingStyle {
  return { colors: { ...style.colors, ...look.colors }, options: { ...style.options, ...look.options } }
}

/**
 * The `--trk-*` variables the block's look changes, for a wrapper around the
 * block. Null when it changes none (the block paints from the page root).
 */
export function blockTrackingVars(branding: BrandingColors, style: TrackingStyle, look: TrackingBlockLook): CSSProperties | null {
  if (isEmptyLook(look)) return null
  const base = buildTrackingTheme(branding, style) as Record<string, string>
  const next = buildTrackingTheme(branding, withBlockLook(style, look)) as Record<string, string>
  const changed = Object.entries(next).filter(([name, value]) => name.startsWith('--trk-') && base[name] !== value)
  return changed.length ? (Object.fromEntries(changed) as CSSProperties) : null
}
