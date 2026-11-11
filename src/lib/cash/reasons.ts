/**
 * "What happened?" at the end of a shift (CONTRACTS §6, copy deck 06 §7).
 *
 * The keys are stored in `staff_shifts.variance_reason`; the labels are what
 * the cashier taps and what the owner reads back. A short drawer and an over
 * drawer get different lists. Copied byte-for-byte into the merchant app
 * (`tests/unit/cash/cash-twins-parity.test.ts`); imports nothing.
 */

export type ShortReasonKey =
  | 'wrong_change'
  | 'unrecorded_pay_out'
  | 'counting_mistake'
  | 'customer_paid_less'
  | 'not_sure'

export type OverReasonKey = 'customer_left_extra' | 'unrecorded_pay_in' | 'counting_mistake' | 'not_sure'

export type VarianceReasonKey = ShortReasonKey | OverReasonKey

export interface VarianceReason<K extends VarianceReasonKey = VarianceReasonKey> {
  readonly key: K
  readonly label: string
}

/** Ask for a reason when the count is off by more than ₱20 (decision 6). */
export const DEFAULT_REASON_FROM_CENTS = 2000

const LABELS: Readonly<Record<VarianceReasonKey, string>> = Object.freeze({
  wrong_change: 'Wrong sukli (change)',
  unrecorded_pay_out: 'Pay out not recorded',
  counting_mistake: 'Counting mistake',
  customer_paid_less: 'Customer paid less',
  not_sure: 'Not sure',
  customer_left_extra: 'Customer left extra',
  unrecorded_pay_in: 'Pay in not recorded',
})

function reason<K extends VarianceReasonKey>(key: K): VarianceReason<K> {
  return Object.freeze({ key, label: LABELS[key] })
}

export const SHORT_REASONS: readonly VarianceReason<ShortReasonKey>[] = Object.freeze([
  reason('wrong_change'),
  reason('unrecorded_pay_out'),
  reason('counting_mistake'),
  reason('customer_paid_less'),
  reason('not_sure'),
])

export const OVER_REASONS: readonly VarianceReason<OverReasonKey>[] = Object.freeze([
  reason('customer_left_extra'),
  reason('unrecorded_pay_in'),
  reason('counting_mistake'),
  reason('not_sure'),
])

const NO_REASONS: readonly VarianceReason[] = Object.freeze([])

export type CountVerdict = 'exact' | 'short' | 'over'

/** counted − expected, in centavos → the word the verdict card shows. */
export function countVerdict(differenceCents: number): CountVerdict {
  if (differenceCents < 0) return 'short'
  if (differenceCents > 0) return 'over'
  return 'exact'
}

/** The chips for a difference (counted − expected): short list, over list, or none. */
export function reasonsFor(differenceCents: number): readonly VarianceReason[] {
  const verdict = countVerdict(differenceCents)
  if (verdict === 'short') return SHORT_REASONS
  if (verdict === 'over') return OVER_REASONS
  return NO_REASONS
}

/** A reason is required when the difference is MORE than the store's threshold, either way. */
export function isReasonRequired(differenceCents: number, thresholdCents: number = DEFAULT_REASON_FROM_CENTS): boolean {
  return Math.abs(differenceCents) > Math.max(0, thresholdCents)
}

export function isVarianceReasonKey(value: unknown): value is VarianceReasonKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(LABELS, value)
}

/** A stored key → its label; null for anything that isn't one. */
export function reasonLabel(key: unknown): string | null {
  return isVarianceReasonKey(key) ? LABELS[key] : null
}
