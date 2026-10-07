/**
 * The brand color of a store, read out of its logo.
 *
 * Onboarding asks a merchant for a logo, not a hex code, so the palette is
 * derived from the logo itself. The answer is deliberately conservative: a
 * logo that is mostly white, black or grey has no brand color to speak of, and
 * the caller then falls back to its store type's default — a wrong, muddy
 * color is worse than a sensible default.
 *
 * `pickBrandColor` is the pure decision over raw pixels; the sharp half only
 * decodes and shrinks the image.
 */

import 'server-only'
import sharp from 'sharp'

/** Logos are shrunk to this box before counting; color, not detail, matters. */
const SAMPLE_SIZE = 64
/** Pixels at least this transparent are background, not logo. */
const MIN_ALPHA = 128
/** Lightness outside this band is white paper or black ink, never the brand. */
const MIN_LIGHTNESS = 0.08
const MAX_LIGHTNESS = 0.92
/** Below this chroma (max − min channel, 0..1) a pixel reads as grey. */
const MIN_CHROMA = 0.15
/**
 * Colored pixels must make up at least this share of the visible logo, or the
 * "brand color" is a stray antialiasing fringe.
 */
const MIN_COLORED_SHARE = 0.01
/** Channel bits kept when bucketing (4 → 16 levels per channel). */
const BUCKET_SHIFT = 4

interface Bucket {
  count: number
  r: number
  g: number
  b: number
  saturation: number
}

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

/** HSL saturation of one pixel, 0..1. */
function saturationOf(max: number, min: number, lightness: number): number {
  if (max === min) return 0
  const chroma = (max - min) / 255
  return chroma / (1 - Math.abs(2 * lightness - 1))
}

/**
 * The dominant saturated color of raw pixels (`channels` = 3 RGB or 4 RGBA),
 * as `#rrggbb`, or null when the image is essentially greyscale.
 *
 * Buckets colors coarsely, then scores each bucket by how often it appears,
 * weighted toward saturation so a vivid mark beats a large dull area. The
 * winning bucket's AVERAGE is returned, not its corner, so the hex matches
 * what the logo actually shows.
 */
export function pickBrandColor(pixels: Uint8Array, channels: number): string | null {
  if (channels < 3 || pixels.length < channels) return null
  const hasAlpha = channels >= 4
  const buckets = new Map<number, Bucket>()
  let visible = 0
  let colored = 0

  for (let i = 0; i + channels <= pixels.length; i += channels) {
    if (hasAlpha && pixels[i + 3] < MIN_ALPHA) continue
    visible++

    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 510
    if (lightness < MIN_LIGHTNESS || lightness > MAX_LIGHTNESS) continue
    if ((max - min) / 255 < MIN_CHROMA) continue
    colored++

    const key = ((r >> BUCKET_SHIFT) << 8) | ((g >> BUCKET_SHIFT) << 4) | (b >> BUCKET_SHIFT)
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0, saturation: 0 }
    buckets.set(key, {
      count: bucket.count + 1,
      r: bucket.r + r,
      g: bucket.g + g,
      b: bucket.b + b,
      saturation: bucket.saturation + saturationOf(max, min, lightness),
    })
  }

  if (visible === 0 || colored / visible < MIN_COLORED_SHARE) return null

  let best: Bucket | null = null
  let bestScore = -1
  for (const bucket of buckets.values()) {
    const score = bucket.count * (0.5 + bucket.saturation / bucket.count)
    if (score > bestScore) {
      best = bucket
      bestScore = score
    }
  }
  if (!best) return null

  return `#${toHex(best.r / best.count)}${toHex(best.g / best.count)}${toHex(best.b / best.count)}`
}

/**
 * The brand color of an encoded logo (PNG, JPEG, WEBP, …), or null when the
 * image cannot be decoded or has no clear brand color. Never throws.
 */
export async function extractBrandColorFromImage(buffer: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(buffer)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return pickBrandColor(new Uint8Array(data.buffer, data.byteOffset, data.length), info.channels)
  } catch {
    return null
  }
}
