/**
 * What a voucher is worth, and which lines it comes off.
 *
 * Two decisions worth knowing about:
 *
 * 1. **Sequential, not parallel.** A second voucher discounts what the first
 *    one left behind. Two 50% vouchers on a ₱200 cart give ₱150 off, not ₱200.
 *    Computing both against the original price is how a merchant accidentally
 *    gives an order away.
 *
 * 2. **Allocation is computed once, at redemption.** When the order is edited
 *    or partly refunded weeks later, "how much of this discount belonged to the
 *    pasta" is the only way to work out what to hand back — and the cart that
 *    earned it is long gone by then.
 *
 * Pure: no clock of its own, no I/O, no mutation of anything the caller owns.
 */

import { getEligibleLines } from './eligibility'
import type { DiscountContext, Voucher } from './types'

const CENTAVO_PRECISION = 100

function roundMoney(value: number): number {
  return Math.round(value * CENTAVO_PRECISION) / CENTAVO_PRECISION
}

export interface DiscountAllocation {
  lineId: string
  amount: number
}

export interface VoucherDiscountResult {
  /** Everything taken off: lines plus delivery. */
  amount: number
  lineAmount: number
  deliveryAmount: number
  allocations: readonly DiscountAllocation[]
}

/**
 * How much of each line — and of the delivery fee — is still discountable.
 * Threaded through a stack of vouchers so each one sees what is left.
 */
export interface RemainingAmounts {
  byLine: Readonly<Record<string, number>>
  deliveryFee: number
}

export function createRemainingAmounts(context: DiscountContext): RemainingAmounts {
  const byLine: Record<string, number> = {}
  for (const line of context.lines) {
    byLine[line.id] = line.subtotal
  }
  return { byLine, deliveryFee: context.deliveryFee }
}

/** Returns a NEW remaining state with this voucher's take subtracted. */
export function applyDiscountToRemaining(
  remaining: RemainingAmounts,
  result: VoucherDiscountResult,
): RemainingAmounts {
  const byLine = { ...remaining.byLine }
  for (const allocation of result.allocations) {
    byLine[allocation.lineId] = roundMoney((byLine[allocation.lineId] ?? 0) - allocation.amount)
  }
  return {
    byLine,
    deliveryFee: roundMoney(remaining.deliveryFee - result.deliveryAmount),
  }
}

const EMPTY_RESULT: VoucherDiscountResult = {
  amount: 0,
  lineAmount: 0,
  deliveryAmount: 0,
  allocations: [],
}

/**
 * Splits `total` across `lines` in proportion to what each still holds.
 *
 * The last line absorbs the rounding remainder so the parts always add back up
 * to the whole — a lost centavo here is a refund that never balances.
 */
function allocateProportionally(
  total: number,
  lines: readonly { id: string; remaining: number }[],
): DiscountAllocation[] {
  const pool = lines.reduce((sum, line) => sum + line.remaining, 0)
  if (pool <= 0 || total <= 0) return []

  const allocations: DiscountAllocation[] = []
  let assigned = 0

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1
    const amount = isLast
      ? roundMoney(total - assigned)
      : roundMoney((line.remaining / pool) * total)

    if (amount <= 0) return
    allocations.push({ lineId: line.id, amount })
    assigned = roundMoney(assigned + amount)
  })

  return allocations
}

/**
 * Values `voucher` against `context`, respecting anything already discounted in
 * `remaining`. Assumes eligibility has been checked; an ineligible voucher
 * simply comes out worth zero.
 */
export function computeVoucherDiscount(
  voucher: Voucher,
  context: DiscountContext,
  remaining: RemainingAmounts = createRemainingAmounts(context),
): VoucherDiscountResult {
  if (voucher.discountType === 'free_delivery') {
    const deliveryAmount = roundMoney(Math.max(0, remaining.deliveryFee))
    if (deliveryAmount <= 0) return EMPTY_RESULT
    return { amount: deliveryAmount, lineAmount: 0, deliveryAmount, allocations: [] }
  }

  const eligible = getEligibleLines(voucher, context.lines)
    .map((line) => ({ id: line.id, remaining: Math.max(0, remaining.byLine[line.id] ?? 0) }))
    .filter((line) => line.remaining > 0)

  const eligibleAmount = roundMoney(eligible.reduce((sum, line) => sum + line.remaining, 0))
  if (eligibleAmount <= 0) return EMPTY_RESULT

  const raw =
    voucher.discountType === 'percent'
      ? (eligibleAmount * voucher.discountValue) / 100
      : voucher.discountValue

  // A negative or non-finite value is a corrupt voucher, not a surcharge.
  if (!Number.isFinite(raw) || raw <= 0) return EMPTY_RESULT

  const capped = voucher.maxDiscountAmount != null
    ? Math.min(raw, voucher.maxDiscountAmount)
    : raw

  // Never give away more than the eligible lines are actually worth.
  const lineAmount = roundMoney(Math.min(capped, eligibleAmount))
  if (lineAmount <= 0) return EMPTY_RESULT

  return {
    amount: lineAmount,
    lineAmount,
    deliveryAmount: 0,
    allocations: allocateProportionally(lineAmount, eligible),
  }
}
