/**
 * The customer-facing view of a voucher code.
 *
 * Deliberately narrower than `resolveVouchers`. This crosses the wire to a
 * public checkout page, so it projects the internal result down to just what a
 * summary line needs: which codes were accepted, what each took off, and why
 * anything was turned down.
 *
 * It is NOT authoritative. The amount actually charged is recomputed on the
 * server at order time from the codes themselves; this result only decides what
 * the customer is shown while they are still typing.
 */

import { resolveVouchers, type VoucherLookup } from './resolve'
import type { DiscountContext, VoucherRejectionReason } from './types'

export interface AcceptedVoucherPreview {
  code: string
  name: string
  description?: string | null
  /** What this voucher took off, after stacking and caps. */
  amount: number
}

export interface RejectedVoucherPreview {
  code: string
  reason: VoucherRejectionReason
  /** Already phrased for display. */
  message: string
}

export interface VoucherPreview {
  accepted: readonly AcceptedVoucherPreview[]
  rejected: readonly RejectedVoucherPreview[]
  discountTotal: number
  /** The part that came off delivery rather than the food. */
  deliveryDiscount: number
}

export interface BuildVoucherPreviewInput {
  tenantId: string
  codes: readonly string[]
  context: DiscountContext
  customerKey?: string | null
  lookup: VoucherLookup
}

export async function buildVoucherPreview(
  input: BuildVoucherPreviewInput,
): Promise<VoucherPreview> {
  const resolved = await resolveVouchers(input)

  return {
    // Only these four fields cross the wire. Handing back the voucher row
    // would tell any visitor how many redemptions are left, what the
    // per-customer cap is, and which products are targeted.
    accepted: resolved.applied.map((entry) => ({
      code: entry.voucher.code,
      name: entry.voucher.name,
      description: entry.voucher.description ?? null,
      amount: entry.result.amount,
    })),
    rejected: resolved.rejected.map((entry) => ({
      code: entry.code,
      reason: entry.reason,
      message: entry.message,
    })),
    discountTotal: resolved.discountTotal,
    deliveryDiscount: resolved.deliveryDiscount,
  }
}
