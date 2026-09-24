/**
 * Color helpers for card templates and layouts. Pure, so Server Components can
 * import them too (a helper exported from a 'use client' file cannot be).
 */

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const LUMINANCE_THRESHOLD = 0.6

/**
 * Black or white text for a background. Accepts any CSS color, but can only
 * measure hex; anything else gets the caller's fallback.
 */
/** Relative luminance (0 = black, 1 = white) of a hex color, or null for anything else. */
export function luminanceOf(color: string | undefined): number | null {
  if (!color || !HEX_PATTERN.test(color)) return null
  const hex = color.length === 4
    ? color.slice(1).split('').map((c) => c + c).join('')
    : color.slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function readableOn(background: string | undefined, fallback = '#ffffff'): string {
  const luminance = luminanceOf(background)
  if (luminance === null) return fallback
  return luminance > LUMINANCE_THRESHOLD ? '#111111' : '#ffffff'
}

/** `color` mixed into `base` at `percent` — a brand tint that works on any palette. */
export function tint(color: string, percent: number, base = 'transparent'): string {
  return `color-mix(in srgb, ${color} ${percent}%, ${base})`
}
