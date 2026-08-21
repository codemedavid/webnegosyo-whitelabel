/**
 * Shared Lalamove status vocabulary.
 *
 * Lalamove v3 reports: ASSIGNING_DRIVER, ON_GOING, PICKED_UP, COMPLETED,
 * CANCELED, REJECTED, EXPIRED. Older code in this repo also wrote ASSIGNING,
 * ASSIGNED, IN_TRANSIT, DELIVERED and CANCELLED, so both generations are
 * recognized. All checks are case-insensitive because our own writers never
 * agreed on casing either.
 *
 * NOTE: webnegosyo-app keeps a hand-synced copy of the FINAL statuses in its
 * LalamoveDeliveryCard (React Native cannot import from src/). If the set
 * changes here, change it there too.
 */

/** Statuses after which a delivery is over, one way or another. */
export const LALAMOVE_FINAL_STATUSES: ReadonlySet<string> = new Set([
  'COMPLETED',
  'DELIVERED',
  'CANCELED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
])

export function isLalamoveFinal(status: string | null | undefined): boolean {
  if (!status) return false
  return LALAMOVE_FINAL_STATUSES.has(status.toUpperCase())
}

/**
 * A booked delivery that has not finished. This is the predicate that drives
 * auto-sync: active deliveries are worth polling, everything else is not.
 */
export function isActiveLalamoveDelivery(status: string | null | undefined): boolean {
  if (!status) return false
  return !isLalamoveFinal(status)
}

export type LalamoveStatusTone = 'searching' | 'active' | 'done' | 'cancelled' | 'unknown'

const STATUS_TONES: Record<string, LalamoveStatusTone> = {
  ASSIGNING_DRIVER: 'searching',
  ASSIGNING: 'searching',
  ON_GOING: 'active',
  ASSIGNED: 'active',
  PICKED_UP: 'active',
  IN_TRANSIT: 'active',
  COMPLETED: 'done',
  DELIVERED: 'done',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
  REJECTED: 'cancelled',
  EXPIRED: 'cancelled',
}

/**
 * Collapse a raw status into a UI tone so badge styling lives in one place
 * instead of a fresh ternary chain per component.
 */
export function lalamoveStatusTone(status: string | null | undefined): LalamoveStatusTone {
  if (!status) return 'unknown'
  return STATUS_TONES[status.toUpperCase()] ?? 'unknown'
}
