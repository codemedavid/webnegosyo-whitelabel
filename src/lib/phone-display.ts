/**
 * Display formatting for the PH mobile input on customer-facing forms.
 *
 * Cosmetic only. The value that leaves a form is the canonical E.164 identity
 * from `normalizePhoneE164`, so a number typed here joins the same customer
 * as the one typed at checkout or read from a POS sale.
 */
import { normalizePhoneE164 } from '@/lib/phone'

const LOCAL_MAX_DIGITS = 11 // 0917 123 4567
const INTL_MAX_DIGITS = 12 // 63 917 123 4567

function group(digits: string, sizes: number[]): string {
  const parts: string[] = []
  let cursor = 0
  for (const size of sizes) {
    if (cursor >= digits.length) break
    parts.push(digits.slice(cursor, cursor + size))
    cursor += size
  }
  return parts.join(' ')
}

/** Format a raw keystroke value as `0917 123 4567` or `+63 917 123 4567`. */
export function formatPhMobileInput(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed === '') return ''

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (digits === '') return hasPlus ? '+' : ''

  const isInternational = hasPlus || digits.startsWith('63')
  if (isInternational) {
    const intl = digits.slice(0, INTL_MAX_DIGITS)
    const national = intl.startsWith('63') ? intl.slice(2) : intl
    const prefix = intl.startsWith('63') ? '+63' : `+${intl.slice(0, 2)}`
    return national === '' ? prefix : `${prefix} ${group(national, [3, 3, 4])}`
  }

  return group(digits.slice(0, LOCAL_MAX_DIGITS), [4, 3, 4])
}

/** The canonical `+639XXXXXXXXX` identity, or null while incomplete/invalid. */
export function toPhMobileE164(raw: string): string | null {
  return normalizePhoneE164(raw)
}
