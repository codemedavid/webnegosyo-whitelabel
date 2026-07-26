/**
 * Storefront background image + tint overlay.
 *
 * Pure resolver for the seven `tenants` columns behind the Branding Studio's
 * "Page background" section. Merchants set a custom image (uploaded or pasted),
 * dial its opacity, and lay a tint on top of it. Everything here is defensive:
 * the values come from a merchant-editable column and are interpolated into
 * inline CSS, so an unusable URL, an unknown enum or an out-of-range number
 * degrades to a safe default instead of leaking into the stylesheet.
 */

import type { CSSProperties } from 'react'

/** Every tenant column this feature reads. Kept in sync by a guardrail test. */
export const BACKGROUND_OVERLAY_COLUMNS = [
  'background_image_url',
  'background_image_opacity',
  'background_image_fit',
  'background_image_position',
  'background_image_attachment',
  'background_overlay_color',
  'background_overlay_opacity',
] as const

export type BackgroundImageFit = 'cover' | 'contain' | 'repeat'
export type BackgroundImagePosition = 'center' | 'top' | 'bottom'
export type BackgroundImageAttachment = 'scroll' | 'fixed'

export const BACKGROUND_IMAGE_FITS: readonly BackgroundImageFit[] = ['cover', 'contain', 'repeat']
export const BACKGROUND_IMAGE_POSITIONS: readonly BackgroundImagePosition[] = ['center', 'top', 'bottom']
export const BACKGROUND_IMAGE_ATTACHMENTS: readonly BackgroundImageAttachment[] = ['scroll', 'fixed']

export interface BackgroundOverlay {
  /** True when an image layer should render. */
  hasImage: boolean
  /** True when a tint layer should render (opacity > 0). */
  hasOverlay: boolean
  /** True when either layer renders — i.e. the component is worth mounting. */
  isVisible: boolean
  imageUrl: string | null
  /** 0..1 fraction, applied to the image layer only. */
  imageOpacity: number
  /** CSS `background-size` value. */
  imageSize: 'cover' | 'contain' | 'auto'
  imageRepeat: 'repeat' | 'no-repeat'
  imagePosition: BackgroundImagePosition
  imageAttachment: BackgroundImageAttachment
  /** Hex tint color; only meaningful when `hasOverlay`. */
  overlayColor: string
  /** 0..1 fraction for the tint layer. */
  overlayOpacity: number
}

export const DEFAULT_BACKGROUND_OVERLAY: BackgroundOverlay = {
  hasImage: false,
  hasOverlay: false,
  isVisible: false,
  imageUrl: null,
  imageOpacity: 1,
  imageSize: 'cover',
  imageRepeat: 'no-repeat',
  imagePosition: 'center',
  imageAttachment: 'scroll',
  overlayColor: '#000000',
  overlayOpacity: 0,
}

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
/** Absolute http(s) or site-relative path, with no CSS/url() metacharacters. */
const SAFE_IMAGE_URL = /^(?:https?:\/\/|\/)[^\s"'()\\;]+$/i
const MAX_IMAGE_URL_LENGTH = 2048
const PERCENT_MAX = 100

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Reads a 0..100 percent column and returns it as a 0..1 fraction. */
function readPercentAsFraction(
  source: Record<string, unknown>,
  key: string,
  fallback: number
): number {
  const raw = source[key]
  const percent = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(percent)) return fallback
  return Math.min(PERCENT_MAX, Math.max(0, percent)) / PERCENT_MAX
}

function readEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = readString(source, key)
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function readImageUrl(source: Record<string, unknown>): string | null {
  const url = readString(source, 'background_image_url')
  if (!url || url.length > MAX_IMAGE_URL_LENGTH) return null
  return SAFE_IMAGE_URL.test(url) ? url : null
}

/**
 * Resolve the background layer config from a tenant row. A tenant missing every
 * column (or `null` entirely) resolves to the invisible default, so this is a
 * no-op for tenants that never touched the feature.
 */
export function resolveBackgroundOverlay(
  tenant: Record<string, unknown> | null | undefined
): BackgroundOverlay {
  if (!tenant) return DEFAULT_BACKGROUND_OVERLAY

  const imageUrl = readImageUrl(tenant)
  const fit = readEnum(tenant, 'background_image_fit', BACKGROUND_IMAGE_FITS, 'cover')
  const overlayColorRaw = readString(tenant, 'background_overlay_color')
  const overlayOpacity = readPercentAsFraction(tenant, 'background_overlay_opacity', 0)

  return {
    hasImage: imageUrl !== null,
    hasOverlay: overlayOpacity > 0,
    isVisible: imageUrl !== null || overlayOpacity > 0,
    imageUrl,
    imageOpacity: readPercentAsFraction(tenant, 'background_image_opacity', 1),
    imageSize: fit === 'repeat' ? 'auto' : fit,
    imageRepeat: fit === 'repeat' ? 'repeat' : 'no-repeat',
    imagePosition: readEnum(tenant, 'background_image_position', BACKGROUND_IMAGE_POSITIONS, 'center'),
    imageAttachment: readEnum(
      tenant,
      'background_image_attachment',
      BACKGROUND_IMAGE_ATTACHMENTS,
      'scroll'
    ),
    overlayColor:
      overlayColorRaw && HEX_COLOR.test(overlayColorRaw)
        ? overlayColorRaw
        : DEFAULT_BACKGROUND_OVERLAY.overlayColor,
    overlayOpacity,
  }
}

/**
 * Inline style for the element that mounts `BackgroundOverlayLayer`.
 *
 * The layers are `z-index: -1`, which paints them above their parent's own
 * background *only if* that parent establishes a stacking context. The
 * storefront root paints an opaque page color and otherwise creates no
 * stacking context, so without this the layers fall through to the root
 * stacking context and the page color hides them entirely — present in the
 * DOM, invisible on screen.
 *
 * `isolation: isolate` creates the context with no layout or paint effect of
 * its own. Returns an empty object for tenants with no background configured,
 * so nothing changes for a storefront that never used the feature.
 */
export function buildBackgroundRootStyle(background: BackgroundOverlay): CSSProperties {
  return background.isVisible ? { isolation: 'isolate' } : {}
}

/** Inline style for the image layer. Empty object when there is no image. */
export function buildBackgroundImageStyle(background: BackgroundOverlay): CSSProperties {
  if (!background.hasImage || !background.imageUrl) return {}

  return {
    backgroundImage: `url("${background.imageUrl}")`,
    backgroundSize: background.imageSize,
    backgroundRepeat: background.imageRepeat,
    backgroundPosition: background.imagePosition,
    backgroundAttachment: background.imageAttachment,
    opacity: background.imageOpacity,
  }
}

/** Inline style for the tint layer. Empty object when there is no overlay. */
export function buildBackgroundOverlayStyle(background: BackgroundOverlay): CSSProperties {
  if (!background.hasOverlay) return {}

  return { backgroundColor: hexToRgba(background.overlayColor, background.overlayOpacity) }
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw
  const value = parseInt(full, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
