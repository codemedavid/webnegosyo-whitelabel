/**
 * Can this voucher be used on this cart, right now, at this counter?
 *
 * Pure and clock-injected on purpose: the customer's browser runs this for the
 * instant preview, the server runs it again as the authority, and the register
 * runs it at the counter. All three must reach the same verdict, or a customer
 * ends up arguing with a cashier about a code the website already accepted.
 *
 * This module answers only "may it apply". What it is worth is `discount.ts`.
 */

import type {
  DiscountContext,
  DiscountLine,
  Voucher,
  VoucherEligibility,
  VoucherRejectionReason,
} from './types'

/** Local, dependency-free peso formatting so this module stays portable. */
function formatPesos(amount: number): string {
  return `₱${amount.toFixed(2)}`
}

function reject(
  reason: VoucherRejectionReason,
  message: string,
  extra: { shortfall?: number } = {},
): VoucherEligibility {
  return { isEligible: false, reason, message, ...extra }
}

/**
 * The cart lines this voucher is allowed to discount.
 *
 * A scoped voucher with no targets matches nothing — an empty target list is a
 * misconfiguration, and reading it as "everything" would turn a broken voucher
 * into a store-wide giveaway.
 */
export function getEligibleLines(
  voucher: Voucher,
  lines: readonly DiscountLine[],
): readonly DiscountLine[] {
  if (voucher.scope === 'universal') return lines

  const targets = new Set(voucher.targetIds ?? [])
  if (targets.size === 0) return []

  if (voucher.scope === 'products') {
    return lines.filter((line) => targets.has(line.menuItemId))
  }
  return lines.filter((line) => line.categoryId != null && targets.has(line.categoryId))
}

/** Merchandise total of the whole cart, which is what a minimum spend measures. */
export function getCartSubtotal(lines: readonly DiscountLine[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0)
}

export function evaluateVoucherEligibility(
  voucher: Voucher,
  context: DiscountContext,
): VoucherEligibility {
  if (!voucher.isActive) {
    return reject('inactive', 'This voucher is no longer available.')
  }

  const nowMs = context.now.getTime()

  if (voucher.startsAt && nowMs < Date.parse(voucher.startsAt)) {
    return reject('not_started', 'This voucher is not active yet.')
  }

  // The end instant itself is still valid: a voucher ending "today 23:59:59"
  // has to work AT 23:59:59.
  if (voucher.endsAt && nowMs > Date.parse(voucher.endsAt)) {
    return reject('expired', 'This voucher has expired.')
  }

  if (!voucher.channels.includes(context.channel)) {
    return reject('wrong_channel', 'This voucher cannot be used here.')
  }

  // A branch-restricted voucher is ignored entirely by single-location stores,
  // which stamp no outlet at all.
  const branchRestriction = voucher.outletIds
  if (branchRestriction && branchRestriction.length > 0 && context.outletId) {
    if (!branchRestriction.includes(context.outletId)) {
      return reject('wrong_branch', 'This voucher is not valid at this branch.')
    }
  }

  if (voucher.usageLimitTotal != null && voucher.usedCount >= voucher.usageLimitTotal) {
    return reject('usage_limit_reached', 'This voucher has been fully claimed.')
  }

  // Guest checkout cannot be attributed to a customer, so a per-customer limit
  // is unenforceable there; the total limit above still applies.
  if (
    voucher.usageLimitPerCustomer != null &&
    context.customerUsageCount != null &&
    context.customerUsageCount >= voucher.usageLimitPerCustomer
  ) {
    return reject('customer_limit_reached', 'You have already used this voucher.')
  }

  if (voucher.minOrderAmount != null) {
    const cartSubtotal = getCartSubtotal(context.lines)
    if (cartSubtotal < voucher.minOrderAmount) {
      const shortfall = Math.round((voucher.minOrderAmount - cartSubtotal) * 100) / 100
      return reject(
        'below_minimum',
        `Add ${formatPesos(shortfall)} more to use this voucher.`,
        { shortfall },
      )
    }
  }

  // Free delivery ignores item scope — it discounts the fee, not the food.
  if (voucher.discountType === 'free_delivery') {
    if (context.deliveryFee <= 0) {
      return reject('no_delivery_fee', 'This voucher only applies to delivery orders.')
    }
    return { isEligible: true }
  }

  if (getEligibleLines(voucher, context.lines).length === 0) {
    return reject('no_matching_items', 'This voucher does not apply to anything in your cart.')
  }

  return { isEligible: true }
}
