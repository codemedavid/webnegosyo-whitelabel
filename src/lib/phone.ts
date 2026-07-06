/**
 * Canonical phone normalization for the customer-identity layer.
 *
 * This is the single source of truth for turning a raw, human-entered phone
 * number into a stable E.164 identity key so the same person's orders join into
 * one customer. It supersedes the ad-hoc variants scattered across the codebase
 * (lalamove-phone.ts, meta-conversions.ts, checkout templates, the mobile store).
 *
 * The Philippines is the primary (and effectively only) customer market, so the
 * rules target PH mobile numbers: national significant number = 10 digits
 * beginning with 9, producing `+639XXXXXXXXX`. Anything that cannot be
 * confidently normalized to that shape returns `null` — dirty data must never
 * manufacture a junk customer.
 */

/** Region hint for normalization. PH is the only fully-supported region today. */
export type PhoneRegion = 'PH'

const PH_E164 = /^\+63\d{10}$/

/**
 * Normalize a raw phone number to E.164 (`+63XXXXXXXXXX`) for the given region.
 *
 * Returns `null` for missing, empty, placeholder, or malformed input so callers
 * can safely skip un-identifiable orders instead of grouping them together.
 */
export function normalizePhoneE164(
  raw: string | null | undefined,
  region: PhoneRegion = 'PH'
): string | null {
  if (!raw) return null

  const trimmed = String(raw).trim()
  if (trimmed === '') return null

  // Keep only the leading `+` (if any) and digits.
  const hasPlus = trimmed.startsWith('+')
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return null

  // `00` is the international dialing prefix — treat the remainder as E.164.
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  if (region === 'PH') {
    return normalizePhToE164(digits)
  }

  // Unsupported region: only trust already-international input.
  if (hasPlus && digits.length >= 8) return `+${digits}`
  return null
}

/** Apply PH-specific rules and validate the E.164 mobile shape. */
function normalizePhToE164(digits: string): string | null {
  let candidate: string

  if (digits.startsWith('63')) {
    // Country code already present: 639XXXXXXXXX
    candidate = `+${digits}`
  } else if (digits.startsWith('0')) {
    // Local trunk-prefixed: 09XXXXXXXXX -> drop the trunk 0
    candidate = `+63${digits.slice(1)}`
  } else if (digits.length === 10 && digits.startsWith('9')) {
    // National significant number: 9XXXXXXXXX
    candidate = `+63${digits}`
  } else {
    candidate = `+63${digits}`
  }

  return PH_E164.test(candidate) ? candidate : null
}
