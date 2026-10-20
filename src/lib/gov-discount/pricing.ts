/**
 * The law's arithmetic for one claimant's share, in centavos.
 *
 * VAT-registered store, Senior/PWD (RR 7-2010 §7, RR 5-2017 §4):
 *   base = share ÷ 1.12, discount = 20% × base, they pay base − discount.
 *   ₱560 → base ₱500, VAT removed ₱60, discount ₱100, pays ₱400.
 *
 * Non-VAT store (RR 5-2017 §5.1 illustration): 20% off the price.
 *   ₱560 → discount ₱112, pays ₱448.
 *
 * VAT store, athletes/coaches (RR 13-2020): 20% off the VAT-exclusive price,
 * VAT then charged on what is left.
 *   ₱560 → base ₱500, discount ₱100, VAT ₱48, pays ₱448.
 *
 * Each figure is rounded once and the rest derived by subtraction, so
 * VAT removed + discount always equals what came off.
 */

import { GOV_DISCOUNT_RULES } from './rules'
import { percentOf, vatExclusive, vatOn } from './money'
import type { GovDiscountKind, VatStatus } from './types'

export interface ShareFigures {
  vatExemptSales: number
  vatRemoved: number
  discount: number
  netDue: number
  /** VATable base still charged VAT (athletes at a VAT store), else 0. */
  vatableBase: number
  /** VAT still charged on that base, else 0. */
  vatCharged: number
}

export function priceShare(
  grossCents: number,
  kind: GovDiscountKind,
  vatStatus: VatStatus,
): ShareFigures {
  const rule = GOV_DISCOUNT_RULES[kind]
  const gross = Math.max(0, grossCents)

  if (vatStatus === 'non_vat') {
    const discount = percentOf(gross, rule.ratePercent)
    return {
      vatExemptSales: 0,
      vatRemoved: 0,
      discount,
      netDue: gross - discount,
      vatableBase: 0,
      vatCharged: 0,
    }
  }

  const base = vatExclusive(gross)
  const discount = percentOf(base, rule.ratePercent)

  if (rule.vatTreatment === 'exempt') {
    return {
      vatExemptSales: base,
      vatRemoved: gross - base,
      discount,
      netDue: base - discount,
      vatableBase: 0,
      vatCharged: 0,
    }
  }

  const discounted = base - discount
  const vatCharged = vatOn(discounted)
  return {
    vatExemptSales: 0,
    // The VAT the discount itself spared them: original VAT minus VAT charged.
    vatRemoved: gross - base - vatCharged,
    discount,
    netDue: discounted + vatCharged,
    vatableBase: discounted,
    vatCharged,
  }
}

/**
 * Their share of a service charge and the VAT removed from it, under
 * `exempt_share` at a VAT store. The share is pro-rata to their food.
 */
export function serviceChargeRelief(
  serviceChargeCents: number,
  shareCents: number,
  itemsCents: number,
): { share: number; vatRemoved: number } {
  if (serviceChargeCents <= 0 || shareCents <= 0 || itemsCents <= 0) {
    return { share: 0, vatRemoved: 0 }
  }
  const share = Math.round((serviceChargeCents * shareCents) / itemsCents)
  return { share, vatRemoved: share - vatExclusive(share) }
}
