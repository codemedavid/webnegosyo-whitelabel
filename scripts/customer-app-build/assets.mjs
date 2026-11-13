/**
 * Store-app icons and splash from the one app icon App Studio holds
 * (customer app P9, docs/plans/2026-11-13-customer-app-p9-build-pipeline.md).
 *
 * Input: the app icon (App Studio already checked it is square, ≥1024 px and
 * opaque), the splash colour, and an optional splash image. Output, all PNG:
 *
 *   icon.png                  1024² opaque (Apple refuses any transparency)
 *   adaptive-foreground.png   1024² transparent, the icon inset into the 66%
 *                             safe zone, so a round launcher mask never cuts it
 *   adaptive-monochrome.png   1024² the mark as one colour (Android 13 themed icons)
 *   notification-icon.png     96² white on transparent (Android draws it as a mask)
 *   splash.png                the splash image, else the icon
 *
 * plus `adaptiveBackground`: the icon's own corner colour, so the inset icon
 * sits on a background that continues it instead of a frame.
 *
 * The "mark" is every pixel that differs clearly from that corner colour. It
 * is only used when the icon is flat art (a few colours make up nearly all of
 * it, as in a logo) and the mark covers a sensible share of the square. A
 * photo-like icon has no clean mark, so the monochrome and notification icons
 * fall back to a plain shopping-bag glyph (owner OK'd 2026-11-13).
 *
 * Plain ESM on purpose: the build workflow runs it with `node` and only
 * `sharp` installed (scripts/customer-app-build/package.json).
 */
import sharp from 'sharp'

export const ICON_SIZE = 1024
export const NOTIFICATION_SIZE = 96
/** Android's adaptive-icon safe zone: 66 of 108 dp. */
export const SAFE_ZONE = 66 / 108
/** A pixel this far (0-255 per channel, summed) from the background is part of the mark. */
const MARK_DISTANCE = 96
/** Outside this share of the square the silhouette is not a usable mark. */
export const MARK_COVERAGE = { min: 0.02, max: 0.7 }
/** Flat art: the 16 commonest colours (3 bits a channel) cover at least this share. */
export const FLAT_ART_SHARE = 0.8

const HEX = /^#([0-9A-Fa-f]{6})$/

export function hexToRgb(hex) {
  const match = HEX.exec(hex)
  if (!match) throw new Error(`not a #RRGGBB colour: ${hex}`)
  const value = parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

export function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** The plain fallback mark: a shopping bag, white on transparent. */
export function bagGlyphSvg(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      '<path d="M6 7h12l-1 13H7L6 7z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/></svg>',
  )
}

/** The icon's corner colour (median of the four corners), which the mark is told apart from. */
export async function cornerColour(raw, width, height) {
  const at = (x, y) => {
    const offset = (y * width + x) * 4
    return [raw[offset], raw[offset + 1], raw[offset + 2]]
  }
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)]
  const median = (index) => {
    const values = corners.map((corner) => corner[index]).sort((a, b) => a - b)
    return Math.round((values[1] + values[2]) / 2)
  }
  return { r: median(0), g: median(1), b: median(2) }
}

/**
 * The mark as an alpha mask (1 byte per pixel, 255 = mark) and its coverage.
 * Works on the icon flattened at `size`.
 */
export async function markMask(iconPng, size) {
  const { data, info } = await sharp(iconPng).resize(size, size, { fit: 'cover' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const background = await cornerColour(data, info.width, info.height)
  const mask = Buffer.alloc(info.width * info.height)
  let marked = 0
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4
    const distance =
      Math.abs(data[offset] - background.r) + Math.abs(data[offset + 1] - background.g) + Math.abs(data[offset + 2] - background.b)
    if (distance >= MARK_DISTANCE && data[offset + 3] > 127) {
      mask[index] = 255
      marked += 1
    }
  }
  return { mask, width: info.width, height: info.height, coverage: marked / mask.length, background, flatShare: flatShare(data) }
}

/** Share of pixels in the 16 commonest colours, quantised to 3 bits a channel (RGBA input). */
export function flatShare(rgba) {
  const bins = new Uint32Array(512)
  const pixels = rgba.length / 4
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4
    bins[((rgba[offset] >> 5) << 6) | ((rgba[offset + 1] >> 5) << 3) | (rgba[offset + 2] >> 5)] += 1
  }
  const top = Array.from(bins).sort((a, b) => b - a).slice(0, 16)
  return top.reduce((sum, count) => sum + count, 0) / pixels
}

export function isUsableMark(coverage, share = 1) {
  return share >= FLAT_ART_SHARE && coverage >= MARK_COVERAGE.min && coverage <= MARK_COVERAGE.max
}

/** A white image whose alpha is the mask. */
async function whiteFromMask(mask, width, height) {
  const rgba = Buffer.alloc(width * height * 4)
  for (let index = 0; index < mask.length; index += 1) {
    rgba[index * 4] = 255
    rgba[index * 4 + 1] = 255
    rgba[index * 4 + 2] = 255
    rgba[index * 4 + 3] = mask[index]
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

/** `inner` centred on a transparent square of `size`, scaled to `share` of it. */
async function inset(inner, size, share) {
  const side = Math.round(size * share)
  const scaled = await sharp(inner).resize(side, side, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const offset = Math.round((size - side) / 2)
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: scaled, left: offset, top: offset }])
    .png()
    .toBuffer()
}

/**
 * Every output for one build. `splashBackground` is the App Studio splash
 * colour; `splashPng` is null when no splash image was set.
 *
 * @param {{ iconPng: Buffer, splashPng?: Buffer | null, splashBackground: string }} input
 */
export async function makeAppAssets({ iconPng, splashPng = null, splashBackground }) {
  const splashRgb = hexToRgb(splashBackground)
  const meta = await sharp(iconPng).metadata()
  if (!meta.width || !meta.height) throw new Error('the app icon is not an image')
  if (meta.width !== meta.height) throw new Error(`the app icon must be square (got ${meta.width}×${meta.height})`)
  if (meta.width < ICON_SIZE) throw new Error(`the app icon must be at least ${ICON_SIZE} px (got ${meta.width})`)

  // Apple: no alpha channel at all. Anything see-through lands on the splash colour.
  const icon = await sharp(iconPng).resize(ICON_SIZE, ICON_SIZE).flatten({ background: splashRgb }).removeAlpha().png().toBuffer()

  const mark = await markMask(icon, ICON_SIZE)
  const hasMark = isUsableMark(mark.coverage, mark.flatShare)
  const markPng = hasMark ? await whiteFromMask(mark.mask, mark.width, mark.height) : await sharp(bagGlyphSvg(ICON_SIZE)).png().toBuffer()

  const adaptiveForeground = await inset(icon, ICON_SIZE, SAFE_ZONE)
  const adaptiveMonochrome = await inset(markPng, ICON_SIZE, SAFE_ZONE)
  // The notification mask fills most of its square (Android pads it itself).
  const notificationIcon = await inset(markPng, NOTIFICATION_SIZE, hasMark ? 0.9 : 0.8)

  const splash = splashPng
    ? await sharp(splashPng).resize(ICON_SIZE, ICON_SIZE, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()
    : icon

  return {
    files: {
      'icon.png': icon,
      'adaptive-foreground.png': adaptiveForeground,
      'adaptive-monochrome.png': adaptiveMonochrome,
      'notification-icon.png': notificationIcon,
      'splash.png': splash,
    },
    adaptiveBackground: rgbToHex(mark.background),
    usedFallbackMark: !hasMark,
    markCoverage: mark.coverage,
    flatShare: mark.flatShare,
  }
}

/** What each file must be before EAS minutes are spent on it. Returns problems; empty = fine. */
export async function checkAppAssets(files) {
  const problems = []
  const expect = {
    'icon.png': { width: ICON_SIZE, height: ICON_SIZE, alpha: false },
    'adaptive-foreground.png': { width: ICON_SIZE, height: ICON_SIZE, alpha: true },
    'adaptive-monochrome.png': { width: ICON_SIZE, height: ICON_SIZE, alpha: true },
    'notification-icon.png': { width: NOTIFICATION_SIZE, height: NOTIFICATION_SIZE, alpha: true },
  }
  for (const [name, rule] of Object.entries(expect)) {
    const buffer = files[name]
    if (!buffer) {
      problems.push(`${name} is missing`)
      continue
    }
    const meta = await sharp(buffer).metadata()
    if (meta.format !== 'png') problems.push(`${name} is not a PNG`)
    if (meta.width !== rule.width || meta.height !== rule.height) problems.push(`${name} is ${meta.width}×${meta.height}, not ${rule.width}×${rule.height}`)
    if (Boolean(meta.hasAlpha) !== rule.alpha) problems.push(`${name} ${rule.alpha ? 'needs' : 'must not have'} transparency`)
  }
  if (!files['splash.png']) problems.push('splash.png is missing')
  return problems
}
