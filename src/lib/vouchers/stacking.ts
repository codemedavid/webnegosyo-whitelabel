/**
 * Resolves a set of requested vouchers into the ones that actually apply.
 *
 * This is the entry point every surface calls: the checkout preview, the
 * server's authoritative re-price, and the register. Feeding all three from one
 * function is what keeps the number the customer was shown and the number the
 * merchant is charged identical.
 *
 * Conflict policy: the customer's order of entry is their intent. When a
 * solo-only voucher meets another, the one entered FIRST is kept and the
 * second is rejected with a reason — never silently reordered to whichever is
 * worth more. A customer who is quietly given a different discount than the one
 * they typed has no way to understand what happened.
 */

import { evaluateVoucherEligibility } from './eligibility'
import {
  applyDiscountToRemaining,
  computeVoucherDiscount,
  createRemainingAmounts,
  type VoucherDiscountResult,
} from './discount'
import type { DiscountContext, Voucher, VoucherRejectionReason } from './types'
import type { OrderDiscountLine } from '../order-totals'

const CENTAVO_PRECISION = 100

function roundMoney(value: number): number {
  return Math.round(value * CENTAVO_PRECISION) / CENTAVO_PRECISION
}

export interface AppliedVoucher {
  voucher: Voucher
  result: VoucherDiscountResult
}

export interface RejectedVoucher {
  voucherId: string
  code: string
  reason: VoucherRejectionReason
  message: string
}

export interface VoucherApplication {
  applied: readonly AppliedVoucher[]
  rejected: readonly RejectedVoucher[]
  /** Ready to hand to `computeOrderTotals`. */
  discountLines: readonly OrderDiscountLine[]
  discountTotal: number
  /** The part that came off delivery rather than the food. */
  deliveryDiscount: number
  /** Total discount per cart line, merged across every applied voucher. */
  allocationsByLine: Readonly<Record<string, number>>
}

export function applyVouchers(
  vouchers: readonly Voucher[],
  context: DiscountContext,
): VoucherApplication {
  const applied: AppliedVoucher[] = []
  const rejected: RejectedVoucher[] = []
  const allocationsByLine: Record<string, number> = {}

  let remaining = createRemainingAmounts(context)
  let hasSoloApplied = false

  for (const voucher of vouchers) {
    // Solo-only is symmetric: a solo voucher refuses company, and company
    // refuses a solo voucher that is already on the order.
    const conflictsWithStack =
      applied.length > 0 && (hasSoloApplied || !voucher.isStackable)

    if (conflictsWithStack) {
      rejected.push({
        voucherId: voucher.id,
        code: voucher.code,
        reason: 'not_stackable',
        message: 'This voucher cannot be combined with another voucher.',
      })
      continue
    }

    const eligibility = evaluateVoucherEligibility(voucher, context)
    if (!eligibility.isEligible) {
      rejected.push({
        voucherId: voucher.id,
        code: voucher.code,
        reason: eligibility.reason,
        message: eligibility.message,
      })
      continue
    }

    const result = computeVoucherDiscount(voucher, context, remaining)
    if (result.amount <= 0) {
      rejected.push({
        voucherId: voucher.id,
        code: voucher.code,
        reason: 'no_value',
        message: 'This voucher has no value left to apply to this order.',
      })
      continue
    }

    applied.push({ voucher, result })
    remaining = applyDiscountToRemaining(remaining, result)
    if (!voucher.isStackable) hasSoloApplied = true

    for (const allocation of result.allocations) {
      allocationsByLine[allocation.lineId] = roundMoney(
        (allocationsByLine[allocation.lineId] ?? 0) + allocation.amount,
      )
    }
  }

  const discountLines: OrderDiscountLine[] = applied.map(({ voucher, result }) => ({
    label: voucher.name || voucher.code,
    amount: result.amount,
    voucherId: voucher.id,
    code: voucher.code,
  }))

  return {
    applied,
    rejected,
    discountLines,
    discountTotal: roundMoney(applied.reduce((sum, a) => sum + a.result.amount, 0)),
    deliveryDiscount: roundMoney(applied.reduce((sum, a) => sum + a.result.deliveryAmount, 0)),
    allocationsByLine,
  }
}
