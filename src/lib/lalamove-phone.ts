/**
 * Phone normalization for Lalamove.
 *
 * Lalamove requires E.164 phone numbers (e.g. +639171234567). Merchants and
 * customers commonly enter local formats (09xxxxxxxxx, 9xxxxxxxxx), so we
 * normalize before sending to the API. PH is the primary market and gets the
 * +63 country-code rules; other markets fall back to a generic "+digits" form.
 */

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
  if (trimmed.startsWith('+')) return trimmed

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return undefined

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
