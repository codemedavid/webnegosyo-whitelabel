/**
 * The claimant's name and ID number — what BIR needs on every discounted sale.
 *
 * RR 7-2010 §7 / RR 5-2017 §5.9: the establishment must record the name and
 * ID number of every Senior/PWD it discounts. Without them the deduction (and
 * the input VAT on the sale) is disallowed, so the register refuses to apply
 * a discount with either missing.
 *
 * OSCA IDs are issued per city with no national format, so only the shape is
 * checked. The PWD ID has a national format (RR-PPMM-BBB-NNNNNNN); one that
 * does not match is a WARNING, never a refusal — LGUs have issued older
 * formats, and refusing a real PWD is the worse failure.
 */

import type { GovDiscountKind } from './types'

const MIN_ID_LENGTH = 3
const MAX_ID_LENGTH = 30
const MIN_NAME_LENGTH = 2
const MAX_NAME_LENGTH = 80
const ID_SHAPE = /^[A-Z0-9][A-Z0-9 \-/.]*$/
const PWD_NATIONAL_FORMAT = /^\d{2}-\d{4}-\d{3}-\d{7}$/
const VISIBLE_TAIL = 4

/** Trim, collapse inner spaces, upper-case. Stored and compared in this form. */
export function normalizeIdNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase()
}

export function normalizeClaimantName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export type IdNumberVerdict = 'ok' | 'missing' | 'invalid'

export function checkIdNumber(raw: string): IdNumberVerdict {
  const id = normalizeIdNumber(raw)
  if (id.length === 0) return 'missing'
  if (id.length < MIN_ID_LENGTH || id.length > MAX_ID_LENGTH) return 'invalid'
  if (!ID_SHAPE.test(id) || !/\d/.test(id)) return 'invalid'
  return 'ok'
}

export function isClaimantNameValid(raw: string): boolean {
  const name = normalizeClaimantName(raw)
  return name.length >= MIN_NAME_LENGTH && name.length <= MAX_NAME_LENGTH
}

/** True when a PWD ID does not follow the national format — worth a second look. */
export function looksLikeUnusualPwdId(kind: GovDiscountKind, raw: string): boolean {
  return kind === 'pwd' && !PWD_NATIONAL_FORMAT.test(normalizeIdNumber(raw))
}

/** "••••1234" — what anyone without review rights sees. */
export function maskIdNumber(raw: string): string {
  const id = normalizeIdNumber(raw).replace(/[^A-Z0-9]/g, '')
  if (id.length <= VISIBLE_TAIL) return '•'.repeat(id.length)
  return `••••${id.slice(-VISIBLE_TAIL)}`
}

/** "J. Dela Cruz" — a receipt-length name that still identifies the person. */
export function shortClaimantName(raw: string): string {
  const parts = normalizeClaimantName(raw).split(' ')
  if (parts.length < 2) return parts[0] ?? ''
  return `${parts[0].charAt(0).toUpperCase()}. ${parts.slice(1).join(' ')}`
}
