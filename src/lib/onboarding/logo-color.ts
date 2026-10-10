/**
 * The brand color of a store, read out of its logo.
 *
 * Onboarding asks a merchant for a logo, not a hex code, so the palette is
 * derived from the logo itself. A logo with a real color mark gives that
 * color. A black-and-white logo IS a brand too: it gives its dark ink, so the
 * store launches monochrome instead of in its store type's default color (a
 * black logo on a red restaurant palette reads as somebody else's store).
 * Only a logo with neither (pale greys, a stray colored fringe) gives null,
 * and the caller then falls back to the store type's default.
 *
 * `pickBrandColor` is the pure decision over raw pixels; the sharp half only
 * decodes and shrinks the image.
 */

import 'server-only'

// sharp is loaded on first use, never at import: its native binary can be
// missing from a serverless bundle, and a top-level import then fails the
// whole importing route (2026-10-10: every "Build my store" tap 500'd). A
// missing binary costs only the logo color.

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
/** Grey pixels at most this light are the logo's ink (black, charcoal). */
const MAX_INK_LIGHTNESS = 0.3
/** Ink must make up at least this share of the visible logo to be the brand. */
const MIN_INK_SHARE = 0.02
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

interface InkTotal {
  count: number
  r: number
  g: number
  b: number
}

function averageHex(total: { count: number; r: number; g: number; b: number }): string {
  return `#${toHex(total.r / total.count)}${toHex(total.g / total.count)}${toHex(total.b / total.count)}`
}

/**
 * The brand color of raw pixels (`channels` = 3 RGB or 4 RGBA) as `#rrggbb`:
 * the dominant saturated color, else the dark ink of a black-and-white logo,
 * else null.
 *
 * Buckets colors coarsely, then scores each bucket by how often it appears,
 * weighted toward saturation so a vivid mark beats a large dull area. The
 * winning bucket's AVERAGE is returned, not its corner, so the hex matches
 * what the logo actually shows. A real color always beats ink, however much
 * of the logo the ink covers.
 */
export function pickBrandColor(pixels: Uint8Array, channels: number): string | null {
  if (channels < 3 || pixels.length < channels) return null
  const hasAlpha = channels >= 4
  const buckets = new Map<number, Bucket>()
  let ink: InkTotal = { count: 0, r: 0, g: 0, b: 0 }
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
    const isGrey = (max - min) / 255 < MIN_CHROMA
    if ((isGrey || lightness < MIN_LIGHTNESS) && lightness <= MAX_INK_LIGHTNESS) {
      ink = { count: ink.count + 1, r: ink.r + r, g: ink.g + g, b: ink.b + b }
      continue
    }
    if (isGrey || lightness < MIN_LIGHTNESS || lightness > MAX_LIGHTNESS) continue
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

  if (visible === 0) return null
  if (colored / visible < MIN_COLORED_SHARE) return ink.count / visible >= MIN_INK_SHARE ? averageHex(ink) : null

  let best: Bucket | null = null
  let bestScore = -1
  for (const bucket of buckets.values()) {
    const score = bucket.count * (0.5 + bucket.saturation / bucket.count)
    if (score > bestScore) {
      best = bucket
      bestScore = score
    }
  }
  return best ? averageHex(best) : null
}

/**
 * The brand color of an encoded logo (PNG, JPEG, WEBP, …) — a color mark, or
 * the ink of a black-and-white logo — or null when the image cannot be
 * decoded or has neither. Never throws.
 */
export async function extractBrandColorFromImage(buffer: Buffer): Promise<string | null> {
  try {
    const { default: sharp } = await import('sharp')
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
