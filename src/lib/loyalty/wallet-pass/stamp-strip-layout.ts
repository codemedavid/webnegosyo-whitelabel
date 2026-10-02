/**
 * Where the stamps go on the Apple Wallet strip image, and the SVG drawn
 * around them.
 *
 * Pure: `stamp-strip.ts` rasterises these SVGs and drops the store logo into
 * every stamped slot. The grid mirrors the tracking page's stamp card — one
 * row up to six stamps, two rows above that, the reward slot marked with a
 * gift — so the card in the wallet looks like the card on the receipt.
 *
 * The SVG is markup built from merchant colours, so colours are re-checked
 * here as plain hex rather than trusted from the caller.
 */

import { luminance, type WalletStampCard } from './content'

/** Apple's strip area for a store card, in points. */
export const STRIP_SIZE_PT = { width: 375, height: 144 } as const

const PADDING_X_PT = 18
const PADDING_Y_PT = 14
const GAP_PT = 10
const MAX_DIAMETER_PT = 64
const SINGLE_ROW_MAX = 6
const RING_RATIO = 0.06
const GIFT_RATIO = 0.44
const BADGE_RATIO = 0.19
const BADGE_OFFSET_RATIO = 0.33
const EMPTY_FILL_OPACITY = 0.92
const EMPTY_RING_OPACITY = 0.35
const EMPTY_GIFT_OPACITY = 0.75

const HEX = /^#[0-9A-F]{6}$/i

/** Lucide's "gift", on a 24-unit grid. */
const GIFT_PATHS = [
  '<rect x="3" y="8" width="18" height="4" rx="1"/>',
  '<path d="M12 8v13"/>',
  '<path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>',
  '<path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
].join('')

export interface StampSlot {
  index: number
  cx: number
  cy: number
  isFilled: boolean
  isReward: boolean
}

export interface StampStripLayout {
  width: number
  height: number
  diameter: number
  ringWidth: number
  /** The logo disc inside a stamped slot's ring. */
  logoDiameter: number
  slots: StampSlot[]
}

export interface StampStripColors {
  background: string
  foreground: string
}

export function layoutStampStrip(card: WalletStampCard, scale: number): StampStripLayout {
  const total = Math.max(card.total, 1)
  const rows = total <= SINGLE_ROW_MAX ? 1 : 2
  const columns = Math.ceil(total / rows)
  const usableWidth = STRIP_SIZE_PT.width - PADDING_X_PT * 2 - GAP_PT * (columns - 1)
  const usableHeight = STRIP_SIZE_PT.height - PADDING_Y_PT * 2 - GAP_PT * (rows - 1)
  const diameterPt = Math.min(usableWidth / columns, usableHeight / rows, MAX_DIAMETER_PT)

  const gridWidth = columns * diameterPt + (columns - 1) * GAP_PT
  const gridHeight = rows * diameterPt + (rows - 1) * GAP_PT
  const left = (STRIP_SIZE_PT.width - gridWidth) / 2
  const top = (STRIP_SIZE_PT.height - gridHeight) / 2
  const rewardSlots = new Set(card.rewardSlots)

  const slots = Array.from({ length: total }, (_, index): StampSlot => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      index,
      cx: (left + column * (diameterPt + GAP_PT) + diameterPt / 2) * scale,
      cy: (top + row * (diameterPt + GAP_PT) + diameterPt / 2) * scale,
      isFilled: index < card.filled,
      isReward: rewardSlots.has(index + 1),
    }
  })

  const diameter = diameterPt * scale
  const ringWidth = diameter * RING_RATIO
  return {
    width: STRIP_SIZE_PT.width * scale,
    height: STRIP_SIZE_PT.height * scale,
    diameter,
    ringWidth,
    logoDiameter: Math.round(diameter - ringWidth * 2),
    slots,
  }
}

function num(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function gift(cx: number, cy: number, size: number, color: string, opacity = 1): string {
  return `<g transform="translate(${num(cx - size / 2)} ${num(cy - size / 2)}) scale(${num(size / 24)})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${GIFT_PATHS}</g>`
}

/**
 * Marks drawn ON a white empty slot use the darker brand colour: white text on
 * a green card would vanish there, the green itself does not.
 */
function inkOnWhite(colors: StampStripColors): string {
  return luminance(colors.foreground) <= luminance(colors.background) ? colors.foreground : colors.background
}

function emptySlot(slot: StampSlot, layout: StampStripLayout, ink: string): string {
  const radius = layout.diameter / 2 - layout.ringWidth / 2
  const circle = `<circle cx="${num(slot.cx)}" cy="${num(slot.cy)}" r="${num(radius)}" fill="#FFFFFF" fill-opacity="${EMPTY_FILL_OPACITY}" stroke="${ink}" stroke-opacity="${EMPTY_RING_OPACITY}" stroke-width="${num(layout.ringWidth * 0.6)}"/>`
  if (!slot.isReward) return circle
  return circle + gift(slot.cx, slot.cy, layout.diameter * GIFT_RATIO, ink, EMPTY_GIFT_OPACITY)
}

function stampedRing(slot: StampSlot, layout: StampStripLayout, colors: StampStripColors): string {
  const radius = layout.diameter / 2 - layout.ringWidth / 2
  const ring = `<circle cx="${num(slot.cx)}" cy="${num(slot.cy)}" r="${num(radius)}" fill="none" stroke="${colors.foreground}" stroke-width="${num(layout.ringWidth)}"/>`
  if (!slot.isReward) return ring
  const badgeRadius = layout.diameter * BADGE_RATIO
  const bx = slot.cx + layout.diameter * BADGE_OFFSET_RATIO
  const by = slot.cy + layout.diameter * BADGE_OFFSET_RATIO
  const badge = `<circle cx="${num(bx)}" cy="${num(by)}" r="${num(badgeRadius)}" fill="${colors.foreground}" stroke="${colors.background}" stroke-width="${num(layout.ringWidth * 0.8)}"/>`
  return ring + badge + gift(bx, by, badgeRadius * 1.2, colors.background)
}

function svg(layout: StampStripLayout, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">${body}</svg>`
}

/**
 * `base` is the card colour, the empty slots and a white disc under each
 * stamp; the logos are composited onto it, then `overlay` adds the rings and
 * reward badges on top so they are never covered by a logo.
 */
export function buildStampStripSvgs(layout: StampStripLayout, colors: StampStripColors): { base: string; overlay: string } {
  if (!HEX.test(colors.background) || !HEX.test(colors.foreground)) {
    throw new Error('stamp strip colours must be #RRGGBB')
  }
  const ink = inkOnWhite(colors)
  const stamped = layout.slots.filter((slot) => slot.isFilled)
  const empty = layout.slots.filter((slot) => !slot.isFilled)
  const discs = stamped
    .map((slot) => `<circle cx="${num(slot.cx)}" cy="${num(slot.cy)}" r="${num(layout.diameter / 2)}" fill="#FFFFFF"/>`)
    .join('')

  return {
    base: svg(layout, `<rect width="100%" height="100%" fill="${colors.background}"/>${discs}${empty.map((slot) => emptySlot(slot, layout, ink)).join('')}`),
    overlay: svg(layout, stamped.map((slot) => stampedRing(slot, layout, colors)).join('')),
  }
}
