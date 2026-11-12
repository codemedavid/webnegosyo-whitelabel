import type { AppPaymentMethod } from '@/lib/contract'

/**
 * Methods the customer may pick for this order: online (the merchant's
 * PayMongo) only once the store switched it on, and only methods linked to
 * the order type — a method linked to none is offered for none, as on the web
 * checkout (and the server refuses it). No method offered = the order goes
 * without one, as the web places it.
 */
export function availablePaymentMethods(
  methods: readonly AppPaymentMethod[],
  hasOnlinePayments: boolean,
  orderTypeId: string | undefined,
): AppPaymentMethod[] {
  return methods.filter(
    (method) =>
      (method.kind !== 'online' || hasOnlinePayments) &&
      orderTypeId !== undefined &&
      method.orderTypeIds.includes(orderTypeId),
  )
}
