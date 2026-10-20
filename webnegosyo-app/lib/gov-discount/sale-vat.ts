/**
 * The VAT block a VAT-registered store prints under the items:
 *
 *   VATable Sales        1,339.29
 *   VAT (12%)              160.71
 *   VAT-Exempt Sales       446.43
 *   Zero-Rated Sales         0.00
 *   Less: SC/PWD discount  (89.29)
 *   TOTAL                1,857.14
 *
 * RR 7-2024 §6(B.13): a VAT store's invoice must break mixed sales into these
 * lines, and an exempt sale without the "VAT-Exempt Sales" line is taxed as if
 * it were VATable. The identity this module guarantees, to the centavo:
 *
 *   vatableSales + vatAmount + vatExemptSales − lessDiscounts = total due
 *
 * Non-VAT stores print no VAT block (`null`).
 */

import { toCents, toPesos, vatExclusive } from './money'
import { priceShare } from './pricing'
import { GOV_DISCOUNT_RULES } from './rules'
import type { GovClaimantResult, VatBreakdown, VatStatus } from './types'

export interface SaleVatInput {
  vatStatus: VatStatus
  /** The items' VAT-inclusive subtotal, before any discount. */
  itemsTotal: number
  serviceCharge?: number
  deliveryFee?: number
  /** Vouchers and manual discounts (never combined with government ones). */
  otherDiscount?: number
  /** Claimants from a successful `computeGovDiscount`, if any. */
  claimants?: readonly GovClaimantResult[]
}

export function saleVatBreakdown(input: SaleVatInput): VatBreakdown | null {
  if (input.vatStatus !== 'vat') return null

  const claimants = input.claimants ?? []
  let regular =
    toCents(input.itemsTotal) +
    toCents(input.serviceCharge ?? 0) +
    toCents(input.deliveryFee ?? 0) -
    toCents(input.otherDiscount ?? 0)

  let vatableSales = 0
  let vatAmount = 0
  let vatExemptSales = 0
  let lessDiscounts = 0

  for (const claimant of claimants) {
    const gross = toCents(claimant.grossShare)
    regular -= gross + toCents(claimant.serviceChargeShare)

    if (GOV_DISCOUNT_RULES[claimant.kind].vatTreatment === 'exempt') {
      vatExemptSales += toCents(claimant.vatExemptSales)
      lessDiscounts += toCents(claimant.discount)
    } else {
      const figures = priceShare(gross, claimant.kind, 'vat')
      vatableSales += figures.vatableBase
      vatAmount += figures.vatCharged
    }
  }

  const regularBase = vatExclusive(Math.max(0, regular))
  vatableSales += regularBase
  vatAmount += Math.max(0, regular) - regularBase

  return {
    vatableSales: toPesos(vatableSales),
    vatAmount: toPesos(vatAmount),
    vatExemptSales: toPesos(vatExemptSales),
    zeroRatedSales: 0,
    lessDiscounts: toPesos(lessDiscounts),
  }
}
