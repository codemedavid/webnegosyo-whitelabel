/**
 * Cloudflare R2 media URLs (`https://media.webnegosyo.com/<key>`).
 *
 * R2 stores the original; Cloudflare Image Transformations resize it at the
 * edge through the zone's `/cdn-cgi/image/<options>/<key>` path. Stored URLs
 * are always the plain original — transformations are added at render time,
 * exactly like ImageKit's `?tr=` and Cloudinary's `/upload/` params.
 *
 * Pure: no I/O, safe on the edge and in the browser.
 * Plan: docs/plans/2026-10-30-cloudflare-r2-storage-and-email.md.
 */

import type { ImageTransformOptions } from '@/lib/imagekit-utils'

/** The R2 custom domain. Stored image URLs depend on it — never change it. */
export const MEDIA_HOST = 'media.webnegosyo.com'

const TRANSFORM_PREFIX = 'cdn-cgi/image/'

const FIT_BY_CROP: Record<NonNullable<ImageTransformOptions['crop']>, string> = {
  fill: 'cover',
  thumb: 'cover',
  crop: 'cover',
  fit: 'scale-down',
  limit: 'scale-down',
  pad: 'pad',
  scale: 'squeeze',
}

/** `center` is Cloudflare's default, so it adds nothing. */
const GRAVITY: Record<NonNullable<ImageTransformOptions['gravity']>, string | null> = {
  auto: 'auto',
  face: 'face',
  center: null,
  north: 'top',
  south: 'bottom',
  east: 'right',
  west: 'left',
}

const FORMAT: Record<NonNullable<ImageTransformOptions['format']>, string> = {
  auto: 'auto',
  webp: 'webp',
  avif: 'avif',
  png: 'png',
  jpg: 'jpeg',
}

/**
 * `/cdn-cgi/image/<opts>/https://other.host/x.png` asks Cloudflare to fetch and
 * serve ANOTHER origin from our domain. Such a URL is never one of ours.
 */
const REMOTE_SOURCE = /^(https?:|\/)/i

function parseMediaUrl(url: string | null | undefined): URL | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const isMedia =
      parsed.protocol === 'https:' &&
      parsed.host === MEDIA_HOST &&
      parsed.username === '' &&
      parsed.password === '' &&
      !REMOTE_SOURCE.test(keyOf(parsed))
    return isMedia ? parsed : null
  } catch {
    return null
  }
}

/** True for an https URL on the R2 media host (lookalikes and userinfo tricks refused). */
export function isR2MediaUrl(url: string | null | undefined): boolean {
  return parseMediaUrl(url) !== null
}

/** The path without its leading slash and any `/cdn-cgi/image/<options>/` prefix. */
function keyOf(parsed: URL): string {
  const path = parsed.pathname.replace(/^\/+/, '')
  if (!path.startsWith(TRANSFORM_PREFIX)) return path
  const afterPrefix = path.slice(TRANSFORM_PREFIX.length)
  const slash = afterPrefix.indexOf('/')
  return slash < 0 ? '' : afterPrefix.slice(slash + 1)
}

/** The R2 object key of a media URL (`menu-items/a.jpg`), or null for other hosts. */
export function extractMediaKey(url: string | null | undefined): string | null {
  const parsed = parseMediaUrl(url)
  if (!parsed) return null
  return keyOf(parsed) || null
}

function buildOptions(options: ImageTransformOptions): string[] {
  const parts: string[] = []
  if (options.width) parts.push(`width=${Math.round(options.width)}`)
  if (options.height) parts.push(`height=${Math.round(options.height)}`)

  if (options.crop) parts.push(`fit=${FIT_BY_CROP[options.crop]}`)
  else if (options.width && options.height) parts.push('fit=cover')

  const gravity = options.gravity ? GRAVITY[options.gravity] : null
  if (gravity) parts.push(`gravity=${gravity}`)

  if (typeof options.quality === 'number') parts.push(`quality=${Math.round(options.quality)}`)
  if (options.format) parts.push(`format=${FORMAT[options.format]}`)
  if (typeof options.dpr === 'number') parts.push(`dpr=${options.dpr}`)
  return parts
}

/**
 * Resize an R2 media URL through Cloudflare Image Transformations.
 * Other hosts are returned unchanged; null/undefined return null. An existing
 * transformation is replaced, never nested. `format=auto` is the default (as
 * ImageKit does) and `onerror=redirect` serves the original if resizing fails.
 */
export function transformR2Url(
  url: string | null | undefined,
  options: ImageTransformOptions = {},
): string | null {
  if (!url) return null
  const parsed = parseMediaUrl(url)
  if (!parsed) return url

  const parts = buildOptions(options)
  if (parts.length === 0) return url
  if (!options.format) parts.push('format=auto')
  parts.push('onerror=redirect')

  return `${parsed.origin}/${TRANSFORM_PREFIX}${parts.join(',')}/${keyOf(parsed)}${parsed.search}`
}
