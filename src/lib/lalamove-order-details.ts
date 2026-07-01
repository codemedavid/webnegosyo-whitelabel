/**
 * Helpers for promoting a customer's delivery details out of the free-form
 * `customerData` bag and into the top-level Convex order fields.
 *
 * The web checkout stores the delivery address and coordinates inside
 * `customerData` (`delivery_address`, `delivery_lat`, `delivery_lng`) because
 * the tenant's checkout fields are dynamic. Convex's `orders` table, however,
 * exposes dedicated `deliveryAddress` / `deliveryLatitude` / `deliveryLongitude`
 * columns, and `lalamove.bookLalamove` rejects any order whose top-level
 * `deliveryAddress` is missing ("Order missing delivery details").
 *
 * This module bridges the two representations so a Lalamove booking made from
 * the merchant app has the delivery details it needs.
 */

export interface LalamoveDeliveryArgs {
  deliveryAddress?: string
  deliveryLatitude?: number
  deliveryLongitude?: number
}

/**
 * Coerce a coordinate that may arrive as a string (from checkout form state)
 * or a number into a finite number, returning `undefined` for anything that
 * does not parse cleanly.
 */
function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/**
 * Extract the top-level Lalamove delivery fields from a checkout `customerData`
 * bag. Fields that are absent or invalid are omitted so they map cleanly onto
 * Convex's optional columns.
 */
export function buildLalamoveDeliveryArgs(
  customerData?: Record<string, unknown>
): LalamoveDeliveryArgs {
  if (!customerData) return {}

  const args: LalamoveDeliveryArgs = {}

  const address = customerData.delivery_address
  if (typeof address === 'string' && address.trim() !== '') {
    args.deliveryAddress = address
  }

  const latitude = toFiniteNumber(customerData.delivery_lat)
  if (latitude !== undefined) {
    args.deliveryLatitude = latitude
  }

  const longitude = toFiniteNumber(customerData.delivery_lng)
  if (longitude !== undefined) {
    args.deliveryLongitude = longitude
  }

  return args
}
