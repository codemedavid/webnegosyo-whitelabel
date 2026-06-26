/**
 * ImageKit.io URL transformation utilities.
 *
 * These mirror the previous Cloudinary helpers but target ImageKit's `tr=`
 * (transformation) query syntax. They let us request resized/optimized variants
 * directly from the ImageKit CDN instead of routing external images through
 * Next.js Image Optimization (which can time out on third-party hosts).
 *
 * Legacy Cloudinary URLs are still rendered: the unified `transformImageUrl`
 * dispatches Cloudinary URLs to the legacy `cloudinary-utils` helpers so any
 * not-yet-migrated image keeps working.
 */

import { transformCloudinaryUrl, isCloudinaryUrl } from '@/lib/cloudinary-utils'

export interface ImageTransformOptions {
  /** Width in pixels */
  width?: number
  /** Height in pixels */
  height?: number
  /** Quality (1-100). 'auto' lets ImageKit apply its default optimization. */
  quality?: number | 'auto'
  /** Crop mode (Cloudinary-compatible names, mapped to ImageKit equivalents) */
  crop?: 'fill' | 'fit' | 'scale' | 'thumb' | 'crop' | 'pad' | 'limit'
  /** Gravity/focus point for cropping (Cloudinary-compatible names) */
  gravity?: 'auto' | 'face' | 'center' | 'north' | 'south' | 'east' | 'west'
  /** Output format */
  format?: 'auto' | 'webp' | 'avif' | 'png' | 'jpg'
  /** Device pixel ratio for responsive images */
  dpr?: number | 'auto'
}

const IMAGEKIT_HOST = 'ik.imagekit.io'

/** The configured ImageKit URL endpoint, e.g. https://ik.imagekit.io/<id> */
export function getImageKitEndpoint(): string {
  return (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || '').replace(/\/$/, '')
}

/** Check if a URL is served by ImageKit. */
export function isImageKitUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.includes(IMAGEKIT_HOST)) return true
  const endpoint = getImageKitEndpoint()
  return Boolean(endpoint) && url.startsWith(endpoint)
}

/** Map a Cloudinary-style crop name to an ImageKit crop token. */
function mapCrop(crop: ImageTransformOptions['crop']): string | null {
  switch (crop) {
    case 'fill':
    case 'thumb':
    case 'crop':
      return 'c-maintain_ratio'
    case 'fit':
    case 'limit':
      return 'c-at_max'
    case 'pad':
      return 'cm-pad_resize'
    case 'scale':
      return 'c-force'
    default:
      return null
  }
}

/** Map a Cloudinary-style gravity to an ImageKit focus token. */
function mapFocus(gravity: ImageTransformOptions['gravity']): string | null {
  switch (gravity) {
    case 'north':
      return 'fo-top'
    case 'south':
      return 'fo-bottom'
    case 'east':
      return 'fo-right'
    case 'west':
      return 'fo-left'
    case 'auto':
    case 'face':
    case 'center':
      return `fo-${gravity}`
    default:
      return null
  }
}

/** Build the comma-separated ImageKit transformation string from options. */
function buildTransformParams(options: ImageTransformOptions): string {
  const parts: string[] = []

  if (options.width) parts.push(`w-${Math.round(options.width)}`)
  if (options.height) parts.push(`h-${Math.round(options.height)}`)

  const crop = mapCrop(options.crop)
  if (crop) {
    parts.push(crop)
  } else if (options.width && options.height) {
    // Default to center-cropping when both dimensions are given (matches c_fill).
    parts.push('c-maintain_ratio')
  }

  const focus = mapFocus(options.gravity)
  if (focus) parts.push(focus)

  // ImageKit has no "q-auto" token; a numeric quality is honored, 'auto' is left
  // to ImageKit's default optimization.
  if (typeof options.quality === 'number') parts.push(`q-${options.quality}`)

  if (options.format) parts.push(`f-${options.format}`)
  if (options.dpr && options.dpr !== 'auto') parts.push(`dpr-${options.dpr}`)

  return parts.join(',')
}

/**
 * Transform an ImageKit URL with the given options, using the `tr=` query param.
 * Non-ImageKit URLs are returned unchanged; null/undefined return null.
 *
 * @example
 * transformImageKitUrl('https://ik.imagekit.io/id/a.jpg', { width: 400, height: 300 })
 * // => 'https://ik.imagekit.io/id/a.jpg?tr=w-400,h-300,c-maintain_ratio'
 */
export function transformImageKitUrl(
  url: string | null | undefined,
  options: ImageTransformOptions = {},
): string | null {
  if (!url) return null
  if (!isImageKitUrl(url)) return url

  const params = buildTransformParams(options)
  if (!params) return url

  const [base, query = ''] = url.split('?')
  const search = new URLSearchParams(query)
  search.set('tr', params)
  return `${base}?${search.toString().replace(/%2C/gi, ',')}`
}

/**
 * Extract the ImageKit file path (relative to the URL endpoint) from a URL.
 * Strips the endpoint/host, any path-style `tr:` segment, and the query string.
 * Returns null for non-ImageKit or unparseable URLs.
 *
 * @example
 * extractImageKitFilePath('https://ik.imagekit.io/id/payment-proofs/a.jpg?tr=w-100')
 * // => 'payment-proofs/a.jpg'
 */
export function extractImageKitFilePath(url: string | null | undefined): string | null {
  if (!url || !isImageKitUrl(url)) return null

  const withoutQuery = url.split('?')[0]

  // Drop the protocol + host + imagekit id (first path segment after the host).
  const hostIndex = withoutQuery.indexOf(IMAGEKIT_HOST)
  let path: string
  if (hostIndex >= 0) {
    const afterHost = withoutQuery.substring(hostIndex + IMAGEKIT_HOST.length)
    const segments = afterHost.split('/').filter(Boolean)
    // First segment is the imagekit id.
    path = segments.slice(1).join('/')
  } else {
    const endpoint = getImageKitEndpoint()
    path = withoutQuery.startsWith(endpoint)
      ? withoutQuery.substring(endpoint.length)
      : withoutQuery
  }

  const cleaned = path
    .split('/')
    .filter(Boolean)
    .filter((seg) => !seg.startsWith('tr:'))
    .join('/')

  return cleaned || null
}

/** Optimized-URL presets for common use cases. */
export const imagekitPresets = {
  thumbnail: (url: string | null | undefined) =>
    transformImageKitUrl(url, { width: 64, height: 64, crop: 'fill' }),
  avatar: (url: string | null | undefined) =>
    transformImageKitUrl(url, { width: 40, height: 40, crop: 'fill' }),
  logo: (url: string | null | undefined) =>
    transformImageKitUrl(url, { width: 96, height: 96, crop: 'fill' }),
  card: (url: string | null | undefined) =>
    transformImageKitUrl(url, { width: 400, crop: 'fill' }),
  cardLarge: (url: string | null | undefined) =>
    transformImageKitUrl(url, { width: 600, crop: 'fill' }),
  banner: (url: string | null | undefined) =>
    transformImageKitUrl(url, { width: 1200, crop: 'fill' }),
  responsive: (url: string | null | undefined, width: number) =>
    transformImageKitUrl(url, { width }),
}

/** True when the URL can be transformed (ImageKit or legacy Cloudinary). */
export function isOptimizableImageUrl(url: string | null | undefined): boolean {
  return isImageKitUrl(url) || isCloudinaryUrl(url)
}

/**
 * Unified transform that dispatches by host:
 * ImageKit → `tr=` query; legacy Cloudinary → `/upload/` params; else unchanged.
 */
export function transformImageUrl(
  url: string | null | undefined,
  options: ImageTransformOptions = {},
): string | null {
  if (!url) return null
  if (isImageKitUrl(url)) return transformImageKitUrl(url, options)
  if (isCloudinaryUrl(url)) return transformCloudinaryUrl(url, options)
  return url
}

/** Generate a responsive srcset for an ImageKit or Cloudinary URL. */
export function generateImageSrcSet(
  url: string | null | undefined,
  widths: number[] = [320, 640, 960, 1280, 1920],
): string {
  if (!isOptimizableImageUrl(url)) return ''
  return widths
    .map((w) => `${transformImageUrl(url, { width: w, quality: 'auto' })} ${w}w`)
    .join(', ')
}
