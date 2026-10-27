import { randomInt } from 'crypto'

// Excludes ambiguous characters: O, 0, I, 1, L
export const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/**
 * The reference number is the only thing standing between a stranger and a
 * buyer's confirmation page (amount, payment instructions, proof upload), so
 * it is drawn from a CSPRNG: 31^8 ≈ 8.5e11 per day. References issued before
 * 2026-10-26 have 4 characters and keep resolving.
 */
const RANDOM_LENGTH = 8
const LEGACY_RANDOM_LENGTH = 4

const REFERENCE_PATTERN = new RegExp(
  `^WN-\\d{8}-(?:[${SAFE_CHARS}]{${RANDOM_LENGTH}}|[${SAFE_CHARS}]{${LEGACY_RANDOM_LENGTH}})$`
)

export function generateReferenceNumber(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  const datePart = `${y}${m}${d}`

  const random = Array.from({ length: RANDOM_LENGTH }, () => SAFE_CHARS[randomInt(SAFE_CHARS.length)]).join('')

  return `WN-${datePart}-${random}`
}

/** A well-formed reference (new 8-character or legacy 4-character). */
export function isReferenceNumber(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value)
}
