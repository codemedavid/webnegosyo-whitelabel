/**
 * "Pay now" vs "pay in person": the split payment picker's two groups.
 *
 * Payment methods carry no type column, so the grouping reads only what the
 * owner already set on each method: anything that asks the customer for
 * something before the order — a proof, a QR to scan, account details to
 * copy — is paid NOW (online); a method whose payment step is switched off
 * (`skip_payment_details`, cash and the like) or that has nothing to hand
 * over is paid IN PERSON (at the counter, or on delivery). Nothing is
 * inferred from the method's name.
 */

import { isPaymentProofRequired } from '@/lib/payment-proof'
import type { PaymentMethod } from '@/types/database'

export type PaymentGroup = 'now' | 'in_person'

type GroupedMethod = Pick<PaymentMethod, 'details' | 'qr_code_url' | 'require_payment_proof' | 'skip_payment_details'>

export function paymentGroupOf(method: GroupedMethod): PaymentGroup {
  if (isPaymentProofRequired(method)) return 'now'
  if (method.qr_code_url) return 'now'
  if (method.skip_payment_details === true) return 'in_person'
  return method.details?.trim() ? 'now' : 'in_person'
}

export interface PaymentGroups<T> {
  now: T[]
  in_person: T[]
}

/** The methods in each group, in the store's order. */
export function splitPaymentMethods<T extends GroupedMethod>(methods: readonly T[]): PaymentGroups<T> {
  return {
    now: methods.filter((m) => paymentGroupOf(m) === 'now'),
    in_person: methods.filter((m) => paymentGroupOf(m) === 'in_person'),
  }
}

/** Splitting only helps when both groups have a method; otherwise the plain list stands in. */
export function canSplitPayments(groups: PaymentGroups<unknown>): boolean {
  return groups.now.length > 0 && groups.in_person.length > 0
}
