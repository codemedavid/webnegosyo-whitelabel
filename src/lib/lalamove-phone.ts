/**
 * Phone normalization for Lalamove.
 *
 * Lalamove requires E.164 phone numbers (e.g. +639171234567). Merchants and
 * customers commonly enter local formats (09xxxxxxxxx, 9xxxxxxxxx), so we
 * normalize before sending to the API. PH is the primary market and gets the
 * +63 country-code rules; other markets fall back to a generic "+digits" form.
 *
 * Mirrored in convex-template/convex/lalamoveContact.ts — keep both in step.
 */

/** Bare E.164: a plus, a non-zero lead digit, 7–15 digits in all. */
const E164_RE = /^\+[1-9]\d{6,14}$/

/**
 * Normalize a phone number to E.164 for the given Lalamove market.
 * Returns `undefined` when there is nothing usable to normalize.
 */
export function normalizeLalamovePhone(
  phone: string | undefined | null,
  market: string | undefined | null
): string | undefined {
  if (!phone) return undefined

  const trimmed = String(phone).trim()
  if (trimmed === '') return undefined

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return undefined

  // Already international: keep the country code, drop the formatting a human
  // typed around it ("+63 917-123 4567", a trailing space).
  if (trimmed.startsWith('+')) return `+${digits}`

  const isPH = (market || '').toUpperCase() === 'PH'
  if (isPH) {
    // Common PH inputs: 09xxxxxxxxx, 9xxxxxxxxx, 639xxxxxxxxx
    if (digits.startsWith('63')) return `+${digits}`
    if (digits.startsWith('0')) return `+63${digits.slice(1)}`
    if (digits.length === 10 && digits.startsWith('9')) return `+63${digits}`
    return `+63${digits}`
  }

  // Fallback for non-PH markets: assume a country code is already present.
  return `+${digits}`
}

/**
 * True when the value is exactly what Lalamove accepts as a phone. Checked
 * before every booking so a bad number is refused here with a message that
 * says which number, rather than by Lalamove with "'' is not valid 'phone'".
 */
export function isE164Phone(value: string | undefined | null): boolean {
  return typeof value === 'string' && E164_RE.test(value)
}
