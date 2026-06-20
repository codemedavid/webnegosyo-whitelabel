/**
 * Pure decision logic for the customer-checkout delivery-fee flow.
 *
 * Both Lalamove and distance-based delivery need the store's coordinates as the
 * pickup/origin point. When those are missing the checkout used to bail silently,
 * showing no fee and no explanation — which looks exactly like "delivery is broken".
 * This resolver makes that case explicit so the UI can surface it.
 *
 * Lalamove takes precedence over distance-based delivery when both are enabled.
 */

// Coordinates may arrive as numbers (tenant config) or strings (customerData / DB),
// so the resolver accepts either and treats only null/undefined/empty as "missing".
type Coordinate = number | string | null | undefined

export interface DeliveryQuoteInput {
  isDeliveryOrder: boolean
  lalamoveEnabled: boolean
  distanceEnabled: boolean
  restaurantLatitude: Coordinate
  restaurantLongitude: Coordinate
  deliveryLatitude: Coordinate
  deliveryLongitude: Coordinate
}

export type DeliveryQuotePlan =
  | { kind: 'idle' }
  | { kind: 'misconfigured'; message: string }
  | { kind: 'awaiting-address' }
  | { kind: 'lalamove' }
  | { kind: 'distance' }

export const DELIVERY_MISCONFIGURED_MESSAGE =
  "Delivery isn't fully set up for this store yet. Please contact the store to complete your order."

// A coordinate is "present" when it parses to a finite number. 0 is valid; '' / null are not.
function hasCoordinate(value: Coordinate): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string' && value.trim() === '') return false
  return Number.isFinite(typeof value === 'string' ? parseFloat(value) : value)
}

export function resolveDeliveryQuotePlan(input: DeliveryQuoteInput): DeliveryQuotePlan {
  const lalamoveOn = input.isDeliveryOrder && input.lalamoveEnabled
  // Lalamove always wins; distance-based only applies when Lalamove is off.
  const distanceOn = input.isDeliveryOrder && !lalamoveOn && input.distanceEnabled

  if (!lalamoveOn && !distanceOn) {
    return { kind: 'idle' }
  }

  const hasRestaurantLocation =
    hasCoordinate(input.restaurantLatitude) && hasCoordinate(input.restaurantLongitude)

  // Misconfigured beats awaiting-address: the store, not the customer, is the blocker.
  if (!hasRestaurantLocation) {
    return { kind: 'misconfigured', message: DELIVERY_MISCONFIGURED_MESSAGE }
  }

  const hasDeliveryLocation =
    hasCoordinate(input.deliveryLatitude) && hasCoordinate(input.deliveryLongitude)

  if (!hasDeliveryLocation) {
    return { kind: 'awaiting-address' }
  }

  return { kind: lalamoveOn ? 'lalamove' : 'distance' }
}
