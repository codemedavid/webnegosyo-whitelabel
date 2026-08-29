/**
 * The customer's selected order type persists in a single localStorage key
 * shared across every store on the platform (see ORDER_TYPE_STORAGE_KEY in
 * useCart). Visiting store A then checking out at store B would hand B's
 * checkout an order-type ID that belongs to A — every per-order-type fetch
 * (payment methods, customer form fields) then returns zero rows and the
 * payment options silently disappear.
 *
 * This resolver is the single gate: checkout may only ever run with an
 * order type that belongs to the current tenant.
 */

interface EnabledOrderTypeRef {
  id: string
}

/**
 * Returns the stored order type when it belongs to the current tenant,
 * otherwise the tenant's first enabled order type, or null when the tenant
 * has none.
 */
export function resolveActiveOrderType(
  storedOrderTypeId: string | null,
  enabledOrderTypes: readonly EnabledOrderTypeRef[]
): string | null {
  if (enabledOrderTypes.length === 0) return null
  if (storedOrderTypeId && enabledOrderTypes.some(ot => ot.id === storedOrderTypeId)) {
    return storedOrderTypeId
  }
  return enabledOrderTypes[0].id
}
