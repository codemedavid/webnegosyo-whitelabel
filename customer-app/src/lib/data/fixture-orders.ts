import { describeSelections, unitPriceCentavos } from '@/lib/cart/pricing'
import { rewardEstimateCentavos } from '@/lib/checkout/reward'
import { checkoutTotals } from '@/lib/checkout/totals'
import { voucherDiscount, type VoucherTerms } from '@/lib/checkout/voucher'
import type { AppCatalog, AppOrderDetail, AppOrderDraft, AppOrderStatus } from '@/lib/contract'
import { fromCentavos } from '@/lib/money'

/**
 * Prototype only: what the server will do in Phase 4, enough for the screens
 * to be designed against — reprice the draft, apply the voucher and reward,
 * and walk the order through the kitchen on a clock so the tracker moves.
 */

export const PROTOTYPE_VOUCHERS: readonly VoucherTerms[] = [
  { code: 'KAPE10', label: '10% off your order', kind: 'percent', value: 10, maxDiscount: 50, minSpend: 200 },
  { code: 'LESS50', label: '₱50 off', kind: 'fixed', value: 50, maxDiscount: null, minSpend: 300 },
]

export const PROTOTYPE_DELIVERY_FEE = 49
const PREP_MINUTES = 15
const DELIVERY_MINUTES = 35

/** Seconds after placing at which each status begins. */
const STATUS_CLOCK: readonly [number, AppOrderStatus][] = [
  [0, 'pending'],
  [6, 'confirmed'],
  [14, 'preparing'],
  [30, 'ready'],
  [50, 'delivered'],
]

export function prototypeStatusAt(elapsedMs: number): AppOrderStatus {
  return STATUS_CLOCK.reduce<AppOrderStatus>((status, [seconds, next]) => (elapsedMs >= seconds * 1000 ? next : status), 'pending')
}

const minutesFrom = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()

export function priceDraft(draft: AppOrderDraft, catalog: AppCatalog, context: { id: string; number: string; placedAt: string }): AppOrderDetail {
  const orderType = catalog.orderTypes.find((candidate) => candidate.id === draft.orderTypeId)
  if (!orderType) throw new Error('That order type is no longer offered')
  const method = catalog.paymentMethods.find((candidate) => candidate.id === draft.paymentMethodId)
  if (!method || (method.orderTypeIds.length > 0 && !method.orderTypeIds.includes(orderType.id)))
    throw new Error('That payment method is not offered for this order')

  const lines = draft.lines.map((line, index) => {
    const item = catalog.items.find((candidate) => candidate.id === line.itemId)
    if (!item?.isAvailable) throw new Error('Something in your bag is sold out')
    const unitCentavos = unitPriceCentavos(item, line.selections)
    return {
      id: `${context.id}-l${index + 1}`,
      itemId: item.id,
      selections: line.selections,
      name: item.name,
      quantity: line.quantity,
      options: describeSelections(item, line.selections),
      unitCentavos,
      lineCentavos: unitCentavos * line.quantity,
    }
  })

  const subtotalCentavos = lines.reduce((sum, line) => sum + line.lineCentavos, 0)
  const rewardCentavos = draft.rewardId ? rewardEstimateCentavos(lines) : 0
  const voucher = PROTOTYPE_VOUCHERS.find((candidate) => candidate.code === draft.voucherCode?.toUpperCase())
  const voucherCentavos = voucher ? voucherDiscount(voucher, subtotalCentavos - rewardCentavos).discountCentavos : 0
  const isDelivery = orderType.kind === 'delivery'
  const totals = checkoutTotals({
    subtotalCentavos,
    discountCentavos: rewardCentavos + voucherCentavos,
    deliveryFeeCentavos: isDelivery ? PROTOTYPE_DELIVERY_FEE * 100 : 0,
  })
  const outlet = catalog.outlets.find((candidate) => candidate.id === draft.outletId)

  return {
    id: context.id,
    number: context.number,
    status: 'pending',
    placedAt: context.placedAt,
    orderKind: orderType.kind,
    orderTypeName: orderType.name,
    outletName: outlet?.name ?? null,
    lines: lines.map(({ unitCentavos: _unit, lineCentavos, ...line }) => ({ ...line, lineTotal: fromCentavos(lineCentavos) })),
    totals: {
      subtotal: fromCentavos(totals.subtotalCentavos),
      discount: fromCentavos(totals.discountCentavos),
      serviceCharge: 0,
      deliveryFee: fromCentavos(totals.deliveryFeeCentavos),
      total: fromCentavos(totals.totalCentavos),
    },
    // The prototype pretends PayMongo succeeded; transfers and cash wait for the store.
    paymentStatus: method.kind === 'online' ? 'paid' : 'pending',
    paymentMethodName: method.name,
    estimatedReadyAt: minutesFrom(context.placedAt, isDelivery ? DELIVERY_MINUTES : PREP_MINUTES),
  }
}
