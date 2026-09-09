/**
 * The fulfilment kinds an order type can carry (`order_types.type`).
 *
 * The core three — dine_in, pickup, delivery — are one-per-store: the DB pins
 * that with a partial unique index. The aggregator kinds (grab, foodpanda) and
 * the free-label `other` repeat, so a store can run "Shopee Food" and
 * "Lalamove Market" as two `other` rows. Everything that is not dine-in or
 * delivery behaves like pickup: no address, no delivery fee, no radius.
 *
 * Pure and dependency-free so the admin picker, the storefront gating and the
 * register reach the same answer.
 */

export type OrderTypeKind =
  | 'dine_in'
  | 'pickup'
  | 'delivery'
  | 'grab'
  | 'foodpanda'
  | 'other'

export const ORDER_TYPE_KINDS: readonly OrderTypeKind[] = [
  'dine_in',
  'pickup',
  'delivery',
  'grab',
  'foodpanda',
  'other',
]

/** Kinds a store may have at most one of. */
export const SINGLETON_ORDER_TYPE_KINDS: readonly OrderTypeKind[] = [
  'dine_in',
  'pickup',
  'delivery',
]

export const ORDER_TYPE_KIND_LABELS: Record<OrderTypeKind, string> = {
  dine_in: 'Dine In',
  pickup: 'Pick Up',
  delivery: 'Delivery',
  grab: 'Grab',
  foodpanda: 'foodpanda',
  other: 'Other',
}

export function isOrderTypeKind(value: unknown): value is OrderTypeKind {
  return typeof value === 'string' && ORDER_TYPE_KINDS.some(kind => kind === value)
}

/**
 * Whether the kind is fulfilled at the counter: the customer (or a rider)
 * collects, so checkout collects no address and charges no delivery fee.
 */
export function isPickupLike(kind: OrderTypeKind): boolean {
  return kind !== 'dine_in' && kind !== 'delivery'
}

/**
 * The kinds a merchant may still add, given the kinds the store already has.
 * Singletons drop out once used; the repeatable kinds are always offered.
 * Unknown used values (legacy rows, renamed labels) are ignored.
 */
export function availableOrderTypeKinds(
  usedKinds: readonly string[]
): OrderTypeKind[] {
  const used = new Set(usedKinds)
  return ORDER_TYPE_KINDS.filter(
    kind => !(SINGLETON_ORDER_TYPE_KINDS.includes(kind) && used.has(kind))
  )
}
