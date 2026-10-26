import type { AppPaymentMethod } from '@/lib/contract'

/**
 * Methods the customer may pick for this order: online (the merchant's
 * PayMongo) only once the store switched it on, and only methods linked to
 * the order type — an empty link list means every order type.
 */
export function availablePaymentMethods(
  methods: readonly AppPaymentMethod[],
  hasOnlinePayments: boolean,
  orderTypeId: string | undefined,
): AppPaymentMethod[] {
  return methods.filter(
    (method) =>
      (method.kind !== 'online' || hasOnlinePayments) &&
      (method.orderTypeIds.length === 0 || (orderTypeId !== undefined && method.orderTypeIds.includes(orderTypeId))),
  )
}
