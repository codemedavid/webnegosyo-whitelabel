/**
 * What a merchant is allowed to save.
 *
 * The engine refuses to misbehave at redemption time regardless. This is the
 * earlier, kinder failure — at the form, where a mistake can still be
 * corrected instead of showing up in the week's receipts.
 *
 * Pure: no I/O, no framework. The form calls it on change, the server action
 * calls it again before writing, and neither has to trust the other.
 */

import type { VoucherChannel, VoucherDiscountType, VoucherScope } from './types'

export interface VoucherDraft {
  code: string
  name: string
  discountType: VoucherDiscountType
  discountValue: number
  maxDiscountAmount?: number | null
  minOrderAmount?: number | null
  scope: VoucherScope
  targetIds?: readonly string[]
  isStackable: boolean
  usageLimitTotal?: number | null
  usageLimitPerCustomer?: number | null
  startsAt?: string | null
  endsAt?: string | null
  channels?: readonly VoucherChannel[]
}

export interface VoucherIssue {
  field: string
  message: string
}

export interface VoucherValidation {
  errors: readonly VoucherIssue[]
  /** Not blocking. Things a merchant should see before saving. */
  warnings: readonly VoucherIssue[]
}

const MAX_PERCENT = 100
/** Above this, an uncapped percentage is worth flagging. */
const UNCAPPED_PERCENT_WARN_THRESHOLD = 25

/**
 * Upper-cased, with all whitespace removed. Internal spaces are stripped
 * rather than preserved: a code nobody can type at a counter is not a code.
 */
export function normalizeVoucherCode(code: string): string {
  return (code ?? '').replace(/\s+/g, '').toUpperCase()
}

function isBlank(value: string | undefined | null): boolean {
  return typeof value !== 'string' || value.trim() === ''
}

export function validateVoucherDraft(draft: VoucherDraft): VoucherValidation {
  const errors: VoucherIssue[] = []
  const warnings: VoucherIssue[] = []

  if (isBlank(draft.code) || normalizeVoucherCode(draft.code) === '') {
    errors.push({ field: 'code', message: 'Give the voucher a code customers can type.' })
  }

  if (isBlank(draft.name)) {
    errors.push({ field: 'name', message: 'Give the voucher a name so you can tell codes apart.' })
  }

  validateDiscountValue(draft, errors, warnings)
  validateScope(draft, errors)
  validateWindow(draft, errors)
  validateLimits(draft, errors)

  // An empty channel list is a voucher that works nowhere. `undefined` is
  // different: it means "not specified", which the mapper reads as all three.
  if (draft.channels && draft.channels.length === 0) {
    errors.push({ field: 'channels', message: 'Choose at least one place this code can be used.' })
  }

  return { errors, warnings }
}

function validateDiscountValue(
  draft: VoucherDraft,
  errors: VoucherIssue[],
  warnings: VoucherIssue[],
): void {
  // Free delivery takes its amount from the order, not from the voucher.
  if (draft.discountType === 'free_delivery') return

  if (!Number.isFinite(draft.discountValue) || draft.discountValue <= 0) {
    errors.push({ field: 'discountValue', message: 'Enter a discount greater than zero.' })
    return
  }

  if (draft.discountType !== 'percent') return

  if (draft.discountValue > MAX_PERCENT) {
    errors.push({
      field: 'discountValue',
      message: 'A percentage cannot be more than 100% — that would pay customers to order.',
    })
    return
  }

  if (
    draft.discountValue >= UNCAPPED_PERCENT_WARN_THRESHOLD &&
    (draft.maxDiscountAmount == null || draft.maxDiscountAmount <= 0)
  ) {
    warnings.push({
      field: 'maxDiscountAmount',
      message: `${draft.discountValue}% off with no cap — a large order could discount far more than you intend.`,
    })
  }
}

function validateScope(draft: VoucherDraft, errors: VoucherIssue[]): void {
  if (draft.scope === 'universal') return

  // The engine reads an empty target list as "matches nothing", which is the
  // safe reading at redemption time but a silently dead voucher here.
  if (!draft.targetIds || draft.targetIds.length === 0) {
    errors.push({
      field: 'targetIds',
      message:
        draft.scope === 'categories'
          ? 'Choose at least one category, or this code will never apply.'
          : 'Choose at least one product, or this code will never apply.',
    })
  }
}

function validateWindow(draft: VoucherDraft, errors: VoucherIssue[]): void {
  if (!draft.startsAt || !draft.endsAt) return

  const starts = Date.parse(draft.startsAt)
  const ends = Date.parse(draft.endsAt)
  if (Number.isNaN(starts) || Number.isNaN(ends)) return

  if (ends <= starts) {
    errors.push({ field: 'endsAt', message: 'The end date must come after the start date.' })
  }
}

function validateLimits(draft: VoucherDraft, errors: VoucherIssue[]): void {
  // Null is "unlimited", which is a valid choice — only a negative is wrong.
  const limits: Array<[string, number | null | undefined]> = [
    ['usageLimitTotal', draft.usageLimitTotal],
    ['usageLimitPerCustomer', draft.usageLimitPerCustomer],
    ['minOrderAmount', draft.minOrderAmount],
    ['maxDiscountAmount', draft.maxDiscountAmount],
  ]

  for (const [field, value] of limits) {
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      errors.push({ field, message: 'This cannot be negative.' })
    }
  }
}
