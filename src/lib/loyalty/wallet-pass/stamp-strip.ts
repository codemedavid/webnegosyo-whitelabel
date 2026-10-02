/**
 * Rasterises the stamp grid into Apple Wallet's `strip.png` at 1×/2×/3×:
 * the card-coloured background and empty slots from `stamp-strip-layout.ts`,
 * the store logo inside every stamped slot, then the rings on top.
 *
 * No text is drawn — serverless hosts have no reliable fonts, and the stamp
 * count is already in the pass's header field.
 */

import 'server-only'
import sharp from 'sharp'
import type { WalletStampCard } from './content'
import { buildStampStripSvgs, layoutStampStrip, type StampStripColors } from './stamp-strip-layout'

/** A transparent logo (a wordmark) sits inside the disc with breathing room. */
const CONTAINED_LOGO_RATIO = 0.74
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

/**
 * The logo as a round stamp face. An opaque logo (a square badge with its own
 * background) fills the disc; a transparent one is centred on white.
 */
async function logoDisc(source: Buffer, diameter: number, isOpaque: boolean): Promise<Buffer> {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${diameter}" height="${diameter}"><circle cx="${diameter / 2}" cy="${diameter / 2}" r="${diameter / 2}" fill="#fff"/></svg>`,
  )
  const inner = isOpaque ? diameter : Math.max(Math.round(diameter * CONTAINED_LOGO_RATIO), 1)
  const logo = await sharp(source)
    .resize(inner, inner, { fit: isOpaque ? 'cover' : 'contain', background: { ...WHITE, alpha: 0 } })
    .png()
    .toBuffer()

  return sharp({ create: { width: diameter, height: diameter, channels: 4, background: WHITE } })
    .composite([{ input: logo, gravity: 'center' }, { input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function renderStrip(source: Buffer, isOpaque: boolean, card: WalletStampCard, colors: StampStripColors, scale: number): Promise<Buffer> {
  const layout = layoutStampStrip(card, scale)
  const { base, overlay } = buildStampStripSvgs(layout, colors)
  const stamped = layout.slots.filter((slot) => slot.isFilled)
  const disc = stamped.length > 0 ? await logoDisc(source, layout.logoDiameter, isOpaque) : null
  const half = layout.logoDiameter / 2

  return sharp(Buffer.from(base))
    .composite([
      ...(disc ? stamped.map((slot) => ({ input: disc, left: Math.round(slot.cx - half), top: Math.round(slot.cy - half) })) : []),
      { input: Buffer.from(overlay), left: 0, top: 0 },
    ])
    .png()
    .toBuffer()
}

export async function renderStampStripFiles(
  source: Buffer,
  card: WalletStampCard,
  colors: StampStripColors,
): Promise<Record<string, Buffer>> {
  const { isOpaque } = await sharp(source).stats()
  const files: Record<string, Buffer> = {}
  for (const scale of [1, 2, 3]) {
    files[`strip${scale === 1 ? '' : `@${scale}x`}.png`] = await renderStrip(source, isOpaque, card, colors, scale)
  }
  return files
}
