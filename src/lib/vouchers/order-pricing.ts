/**
 * The authoritative price of a discounted order.
 *
 * The security boundary of the feature. Everything above it — the checkout
 * preview, the register's running total — is computed on a machine the
 * customer controls, so none of it can be trusted with the amount charged.
 *
 * This takes CODES and recomputes from them, exactly the way
 * `createOrderAction` already re-validates the delivery fee and the outlet id
 * rather than believing the browser. There is deliberately no parameter for a
 * client-supplied discount: if one existed, anyone could set it to the order
 * total and check out for nothing.
 */

import { computeOrderTotals, type OrderTotals } from '../order-totals'
import { buildOrderDiscountPayload, type OrderDiscountPayload } from '../order-discount'
import { resolveVouchers, type ResolvedVouchers, type VoucherLookup } from './resolve'
import type { DiscountLine, VoucherChannel } from './types'

/** Just enough of an order item to discount it. */
export interface PriceableItem {
  menu_item_id: string
  quantity: number
  subtotal: number
}

export interface PriceOrderWithVouchersInput {
  tenantId: string
  items: readonly PriceableItem[]
  deliveryFee?: number | null
  serviceCharge?: number | null
  /** As typed by the customer. Normalized downstream. */
  voucherCodes: readonly string[]
  channel: VoucherChannel
  now: Date
  lookup: VoucherLookup
  /**
   * Category per menu item, for category-scoped vouchers. Absent entries match
   * nothing — a missing map must never widen a voucher to the whole cart.
   */
  categoryByMenuItemId?: Readonly<Record<string, string>>
  outletId?: string | null
  customerKey?: string | null
}

/** One use to burn once the order row exists. */
export interface PendingRedemption {
  voucherId: string
  code: string
  /** What this voucher actually took off, after stacking and caps. */
  amount: number
}

export interface PricedOrder {
  totals: OrderTotals
  application: ResolvedVouchers
  /** Ready for `writeOrderDiscount`. Null when nothing was discounted. */
  discountPayload: OrderDiscountPayload | null
  redemptions: readonly PendingRedemption[]
}

function toDiscountLines(
  items: readonly PriceableItem[],
  categoryByMenuItemId: Readonly<Record<string, string>> | undefined,
): DiscountLine[] {
  return items.map((item, index) => ({
    // Order items have no stable id before insert, so the index is the line
    // identity. It only has to be unique within this one evaluation.
    id: `line-${index}`,
    menuItemId: item.menu_item_id,
    categoryId: categoryByMenuItemId?.[item.menu_item_id] ?? null,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }))
}

export async function priceOrderWithVouchers(
  input: PriceOrderWithVouchersInput,
): Promise<PricedOrder> {
  const lines = toDiscountLines(input.items, input.categoryByMenuItemId)
  const deliveryFee = input.deliveryFee ?? 0
  const serviceCharge = input.serviceCharge ?? 0

  const application = await resolveVouchers({
    tenantId: input.tenantId,
    codes: input.voucherCodes,
    customerKey: input.customerKey,
    lookup: input.lookup,
    context: {
      lines,
      deliveryFee,
      serviceCharge,
      channel: input.channel,
      now: input.now,
      outletId: input.outletId,
    },
  })

  const totals = computeOrderTotals({
    subtotal: lines.reduce((sum, line) => sum + line.subtotal, 0),
    deliveryFee,
    serviceCharge,
    // `computeOrderTotals` already clamps the discount to the chargeable
    // amount, so an oversized fixed voucher floors the total at zero rather
    // than turning it negative.
    discounts: application.discountLines,
  })

  return {
    totals,
    application,
    discountPayload: buildOrderDiscountPayload(application),
    redemptions: application.applied.map((entry) => ({
      voucherId: entry.voucher.id,
      code: entry.voucher.code,
      amount: entry.result.amount,
    })),
  }
}
