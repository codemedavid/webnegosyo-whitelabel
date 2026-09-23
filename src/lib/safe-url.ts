import { z } from 'zod'

/**
 * One definition of "a merchant-supplied URL we are willing to render".
 *
 * Branding URLs land in `href`, `src` and inline CSS `url("…")` on the public
 * storefront. `z.string().url()` only checks syntax, so `javascript:`, `data:`
 * and a value that closes the CSS string (`")`) all passed. A URL accepted here
 * is http(s) and contains none of the characters that can end a quoted CSS
 * string, an unquoted `url(`, or an HTML attribute — so it is safe to emit
 * as-is in any of those positions.
 */

/** Quotes, parentheses, backslash, angle brackets, whitespace and control characters. */
const UNSAFE_URL_CHARS = /["'()\\<>\s\u0000-\u001f\u007f]/
const HTTP_SCHEME = /^https?:\/\//i
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
/** `www.facebook.com/page` — a host (with at least one dot) and an optional path. */
const BARE_HOST_LINK = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i

export const MAX_URL_LENGTH = 2048
const URL_RULE_MESSAGE = 'Must be a full http(s) link without quotes, spaces or parentheses'
const SITE_LINK_RULE_MESSAGE = 'Must be a full http(s) link or a site path starting with "/"'

/** An absolute http(s) URL with a host and no unsafe characters. */
export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !HTTP_SCHEME.test(value) || UNSAFE_URL_CHARS.test(value)) return false
  try {
    const parsed = new URL(value)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname !== ''
  } catch {
    return false
  }
}

/** A same-site path: one leading `/`, never `//` (protocol-relative), no unsafe characters. */
function isSafeSitePath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !UNSAFE_URL_CHARS.test(value)
}

/** An http(s) URL or a site path such as `/menu/item/abc`. */
export function isSafeSiteLink(value: unknown): value is string {
  return typeof value === 'string' && (isSafeHttpUrl(value) || isSafeSitePath(value))
}

/**
 * Merchants often type a social link without its scheme (`www.facebook.com/x`).
 * Give such a bare host an `https://` prefix; leave everything else (full URLs,
 * other schemes, handles) as typed so the URL rule can judge it.
 */
export function normalizeExternalLink(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '' || HAS_SCHEME.test(trimmed)) return trimmed
  return BARE_HOST_LINK.test(trimmed) ? `https://${trimmed}` : trimmed
}

/**
 * A CSS `url("…")` for a stored image URL, or null when the value could break
 * out of the declaration. Validation is the escaping: an accepted value holds
 * no quote, parenthesis, backslash or newline, so it cannot end the string.
 */
export function cssUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (!isSafeHttpUrl(value) && !isSafeSitePath(value)) return null
  return `url("${value}")`
}

/** Schema: '' (cleared) or an http(s) URL. */
export function httpUrlField(max: number = MAX_URL_LENGTH) {
  return z.string().max(max).refine((value) => value === '' || isSafeHttpUrl(value), { message: URL_RULE_MESSAGE })
}

/** Schema: '' (cleared), an http(s) URL, or a site path. */
export function siteLinkField(max: number = MAX_URL_LENGTH) {
  return z.string().max(max).refine((value) => value === '' || isSafeSiteLink(value), { message: SITE_LINK_RULE_MESSAGE })
}

/** Schema: like httpUrlField, but a bare host is first given `https://`. */
export function externalLinkField(max: number = MAX_URL_LENGTH) {
  return z.preprocess((value) => (typeof value === 'string' ? normalizeExternalLink(value) : value), httpUrlField(max))
}
