/**
 * Decides which orders get a scan-to-collect QR, and how an order's fulfilment
 * kind is resolved from the two places it is recorded.
 *
 * Pure and dependency-free so both the tracking page and the tracking service
 * can share one answer.
 */

/** The fixed fulfilment kinds on `order_types.type`. */
export type OrderTypeKind = 'dine_in' | 'pickup' | 'delivery'

const ORDER_TYPE_KINDS: readonly OrderTypeKind[] = [
  'dine_in',
  'pickup',
  'delivery',
]

/**
 * Statuses at which an order is finished and the QR is pointless — or worse,
 * misleading, since a delivered order rescans as "already collected".
 */
const TERMINAL_STATUSES: readonly string[] = ['delivered', 'cancelled']

interface OrderTypeSources {
  /**
   * `order_types.type` joined via the order's `order_type_id`. Authoritative
   * when present.
   */
  orderTypeFromRow: string | null
  /**
   * `orders.order_type` — the string snapshotted at checkout. Usually the enum
   * but degrades to a merchant-editable label, so it is only a fallback.
   */
  orderTypeSnapshot: string | null
}

/**
 * Resolve an order's fulfilment kind, preferring the joined order-type row and
 * falling back to normalizing the snapshot string.
 *
 * Returns null when neither source yields a known kind. Callers must treat
 * null as "unknown", never as a default — a renamed label like "Takeaway
 * Counter" is unmappable, and guessing it wrong either hides the QR from a
 * pickup customer or shows it to a delivery one.
 */
export function resolveOrderTypeKind({
  orderTypeFromRow,
  orderTypeSnapshot,
}: OrderTypeSources): OrderTypeKind | null {
  return toOrderTypeKind(orderTypeFromRow) ?? toOrderTypeKind(orderTypeSnapshot)
}

/**
 * Normalize a string to a known kind: lowercase, and treat spaces and hyphens
 * as the underscore the enum uses ("Dine In" and "DINE-IN" -> "dine_in").
 */
function toOrderTypeKind(value: string | null): OrderTypeKind | null {
  if (!value) return null

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  return ORDER_TYPE_KINDS.find(kind => kind === normalized) ?? null
}

/**
 * Read `tenants.pickup_scan_enabled` into a decision.
 *
 * The column is `NOT NULL DEFAULT true`, so the only ways to see a non-boolean
 * here are an unapplied migration, an older payload, or a caller that never
 * looked it up. None of those mean a merchant switched the feature off, and
 * reading them as "off" would silently disable scan-to-collect for every store
 * on any deploy skew. Absence is enabled; only an explicit false is off.
 */
export function isPickupScanEnabled(value: boolean | null | undefined): boolean {
  return value !== false
}

interface PickupQrVisibility {
  kind: OrderTypeKind | null
  status: string
  /** The store's `pickup_scan_enabled`, already read through isPickupScanEnabled. */
  isScanEnabled: boolean
}

/**
 * Whether to show the customer their scan-to-collect QR.
 *
 * Shown for pickup orders that are still in flight — early enough that the
 * customer is not hunting for it at the counter, and gone once the order is
 * delivered or cancelled. Fails closed on an unresolved kind.
 *
 * The store's switch outranks the order: a merchant who turns scanning off
 * must stop handing out codes on orders that are already in the kitchen, not
 * only on the next one.
 */
export function shouldShowPickupQr({
  kind,
  status,
  isScanEnabled,
}: PickupQrVisibility): boolean {
  if (!isScanEnabled) return false
  if (kind !== 'pickup') return false
  return !TERMINAL_STATUSES.includes(status)
}
