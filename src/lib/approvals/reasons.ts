/**
 * Reason codes (design-spec §4). The code is what is stored; the label is
 * what people read. Declines describe the next step, never the person.
 * Senior/PWD discounts are statutory and never appear here.
 */
import type { ApprovalKind } from './types'

export interface ReasonOption {
  code: string
  label: string
  /** Default for the "Put back in stock" switch (refund / cancel only). */
  restockByDefault?: boolean
}

export const REFUND_REASONS: readonly ReasonOption[] = [
  { code: 'wrong_item', label: 'Wrong item served', restockByDefault: false },
  { code: 'food_quality', label: 'Food quality', restockByDefault: false },
  { code: 'missing_item', label: 'Missing item', restockByDefault: true },
  { code: 'took_too_long', label: 'Took too long', restockByDefault: false },
  { code: 'charged_twice', label: 'Charged twice', restockByDefault: false },
  { code: 'changed_mind', label: 'Customer changed mind', restockByDefault: true },
  { code: 'other', label: 'Other', restockByDefault: false },
]

export const CANCEL_PAID_REASONS: readonly ReasonOption[] = [
  { code: 'customer_left', label: 'Customer left', restockByDefault: true },
  { code: 'changed_mind', label: 'Customer changed mind', restockByDefault: true },
  { code: 'ordered_twice', label: 'Ordered twice by mistake', restockByDefault: true },
  { code: 'wrong_order', label: 'Wrong order entered', restockByDefault: true },
  { code: 'item_ran_out', label: 'Item ran out', restockByDefault: true },
  { code: 'store_closing', label: 'Store closing', restockByDefault: true },
  { code: 'other', label: 'Other', restockByDefault: false },
]

export const DISCOUNT_REASONS: readonly ReasonOption[] = [
  { code: 'make_up', label: 'Make up for a problem' },
  { code: 'regular', label: 'Regular customer (suki)' },
  { code: 'promo_missing', label: 'Promo not in the system' },
  { code: 'staff_meal', label: 'Staff meal' },
  { code: 'owner_guest', label: "Owner's guest" },
  { code: 'other', label: 'Other' },
]

export const WRITEOFF_REASONS: readonly ReasonOption[] = [
  { code: 'spoiled', label: 'Spoiled' },
  { code: 'expired', label: 'Expired' },
  { code: 'dropped', label: 'Dropped or spilled' },
  { code: 'cooking_mistake', label: 'Cooking mistake' },
  { code: 'returned', label: 'Returned by customer' },
  { code: 'count_correction', label: 'Count correction' },
  { code: 'other', label: 'Other' },
]

export const DECLINE_REASONS: readonly ReasonOption[] = [
  { code: 'talk_first', label: "Let's talk first" },
  { code: 'offer_replacement', label: 'Offer a replacement instead' },
  { code: 'check_amount', label: 'Amount looks off, please check' },
  { code: 'already_handled', label: 'Already handled' },
  { code: 'not_policy', label: 'Not covered by our policy' },
  { code: 'other', label: 'Other' },
]

export const REASONS_BY_KIND: Readonly<Record<ApprovalKind, readonly ReasonOption[]>> = {
  refund: REFUND_REASONS,
  cancel_paid: CANCEL_PAID_REASONS,
  discount: DISCOUNT_REASONS,
  stock_writeoff: WRITEOFF_REASONS,
}

/** "Other" needs a note: the note is never the only reason, but "Other" alone says nothing. */
export const NOTE_REQUIRED_REASON = 'other'

export function findReason(kind: ApprovalKind, code: string): ReasonOption | undefined {
  return REASONS_BY_KIND[kind].find((reason) => reason.code === code)
}

export function findDeclineReason(code: string): ReasonOption | undefined {
  return DECLINE_REASONS.find((reason) => reason.code === code)
}

export function reasonLabel(kind: ApprovalKind, code: string): string {
  return findReason(kind, code)?.label ?? code
}

export function declineReasonLabel(code: string): string {
  return findDeclineReason(code)?.label ?? code
}

/** Pre-set for the stock switch (refund/cancel); false when unknown. */
export function defaultRestock(kind: ApprovalKind, code: string): boolean {
  return findReason(kind, code)?.restockByDefault ?? false
}
