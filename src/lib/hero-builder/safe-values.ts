// ---------------------------------------------------------------------------
// Value guards. Every merchant-supplied value that reaches a <style> sheet,
// an href or a src passes through here at RENDER time — the save-time schema
// is a second line, not the only one (designs can reach the DB by other
// paths, and v4 designs are converted on the fly).
// ---------------------------------------------------------------------------

import { LIMITS, THEME_COLOR_KEYS } from './constants'
import type { ThemeColorKey } from './types'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC = /^(rgba?|hsla?)\(\s*[-0-9.%\s,/]+\)$/i
const THEME_REF = /^@([a-z]+)$/

/** Theme color reference, e.g. `@primary` → `var(--hb-primary)`. */
export function themeColorRef(key: ThemeColorKey): string {
  return `@${key}`
}

export function isSafeColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (v.length === 0 || v.length > 64) return false
  if (v === 'transparent' || v === 'currentColor') return true
  if (HEX.test(v) || FUNC.test(v)) return true
  const ref = THEME_REF.exec(v)
  return !!ref && (THEME_COLOR_KEYS as readonly string[]).includes(ref[1])
}

/** CSS color value, or null when the input is not a color we accept. */
export function cssColor(value: unknown): string | null {
  if (!isSafeColor(value)) return null
  const v = value.trim()
  const ref = THEME_REF.exec(v)
  return ref ? `var(--hb-${ref[1]})` : v
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/** Absolute https URL for media (images, video files, posters). */
export function safeMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || v.length > LIMITS.urlLength) return null
  const url = parseUrl(v)
  if (!url || url.protocol !== 'https:') return null
  return url.href
}

const RELATIVE_HREF = /^(\/(?!\/)|#)[^\s<>"'`\\]*$/

/**
 * Link target for buttons, images and icons: http(s), mailto, tel, sms,
 * site-relative paths and in-page anchors. Anything else (javascript:, data:,
 * protocol-relative //evil.com) is dropped.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  if (!v || v.length > LIMITS.urlLength) return null
  if (RELATIVE_HREF.test(v)) return v
  const url = parseUrl(v)
  if (!url) return null
  if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
  if (url.protocol === 'mailto:' || url.protocol === 'tel:' || url.protocol === 'sms:') return v
  return null
}

/** Escape a string for use inside a double-quoted CSS string (in a <style>). */
export function cssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, ' ')
    .replace(/</g, '\\3c ')
    .replace(/>/g, '\\3e ')
}

export function cssUrl(value: unknown): string | null {
  const url = safeMediaUrl(value)
  return url ? `url("${cssString(url)}")` : null
}

export function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(max, Math.max(min, value))
}

export function pickEnum<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

const SLUG = /[^a-z0-9-]+/g

/** In-page anchor id: lowercase letters, digits and dashes only. */
export function safeAnchor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const slug = value.toLowerCase().trim().replace(/\s+/g, '-').replace(SLUG, '').slice(0, 48)
  return slug.length > 0 ? slug : null
}
