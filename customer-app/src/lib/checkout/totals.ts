import { toCentavos } from '@/lib/money'

export interface CheckoutTotalsInput {
  subtotalCentavos: number
  discountCentavos: number
  deliveryFeeCentavos: number
}

export interface CheckoutTotals {
  subtotalCentavos: number
  discountCentavos: number
  deliveryFeeCentavos: number
  totalCentavos: number
}

/**
 * What the review screen shows. An estimate: the server reprices every line
 * and every discount when the order is placed. Discounts come off the food
 * only — never the delivery fee — and never below zero.
 */
export function checkoutTotals({ subtotalCentavos, discountCentavos, deliveryFeeCentavos }: CheckoutTotalsInput): CheckoutTotals {
  const discount = Math.min(Math.max(0, discountCentavos), subtotalCentavos)
  const deliveryFee = Math.max(0, deliveryFeeCentavos)
  return {
    subtotalCentavos,
    discountCentavos: discount,
    deliveryFeeCentavos: deliveryFee,
    totalCentavos: subtotalCentavos - discount + deliveryFee,
  }
}

/** Centavos of food still needed to reach the order type's minimum (pesos on the wire). */
export function minimumOrderShortfall(subtotalCentavos: number, minimumOrderPesos: number | undefined): number {
  if (!minimumOrderPesos) return 0
  return Math.max(0, toCentavos(minimumOrderPesos) - subtotalCentavos)
}
