/**
 * The distance-priced delivery fee, measured from where the delivery STARTS:
 * the order's branch when it is pinned, else the store. One function for the
 * checkout quote (`calculateDistanceDeliveryFeeAction`) and the merchant app's
 * register suggestion (`/api/maps/delivery-quote`), so both price the same trip.
 *
 * A branch with its own `delivery_radius_km` delivers that far; otherwise the
 * store's radius applies.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  distanceConfigFromTenant,
  quoteDistanceDelivery,
  type DistanceDeliveryConfig,
  type DistanceDeliveryTenantFields,
  type LatLng,
  type MeasureDistanceKm,
} from '@/lib/delivery-fee'
import type { DeliveryOrigin } from '@/lib/delivery/delivery-origin'
import { loadDeliveryOrigin, ORIGIN_TENANT_COLUMNS, type OriginStore } from '@/lib/delivery/delivery-origin-server'
import { measureRoadDistanceKm } from '@/lib/maps/road-distance-server'

/** Every tenant column a distance quote reads — never a secret. */
export const DISTANCE_PRICING_COLUMNS =
  'id, lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, ' + ORIGIN_TENANT_COLUMNS

export type DistancePricedStore = OriginStore & DistanceDeliveryTenantFields

export type DistanceQuoteFromOrigin =
  | { kind: 'quote'; fee: number; distanceKm: number; withinRadius: boolean; radiusKm: number }
  /** Lalamove is on, or distance pricing is off/incomplete. */
  | { kind: 'unpriced' }
  /** Neither the branch nor the store has a usable pin. */
  | { kind: 'no-origin' }
  | { kind: 'branch-unreadable' }

/** The pricing config, with the branch's own radius when the origin sets one. */
export function withOriginRadius(
  config: DistanceDeliveryConfig,
  origin: Pick<DeliveryOrigin, 'radiusKm'> | null,
): DistanceDeliveryConfig {
  const radiusKm = origin?.radiusKm
  return radiusKm && radiusKm > 0 && radiusKm !== config.radiusKm ? { ...config, radiusKm } : config
}

export async function quoteDistanceFromOrigin(
  client: SupabaseClient,
  store: DistancePricedStore,
  outletId: string | null | undefined,
  destination: LatLng,
  measureKm: MeasureDistanceKm = measureRoadDistanceKm,
): Promise<DistanceQuoteFromOrigin> {
  const baseConfig = distanceConfigFromTenant(store)
  if (!baseConfig) return { kind: 'unpriced' }

  const lookup = await loadDeliveryOrigin(client, store, outletId)
  if (!lookup.ok) return { kind: 'branch-unreadable' }
  if (!lookup.origin) return { kind: 'no-origin' }

  const config = withOriginRadius(baseConfig, lookup.origin)
  const outcome = await quoteDistanceDelivery({ config, store: lookup.origin.point, destination, measureKm })
  if (outcome.kind !== 'quote') return { kind: 'no-origin' }
  return {
    kind: 'quote',
    fee: outcome.quote.fee,
    distanceKm: outcome.quote.distanceKm,
    withinRadius: outcome.quote.withinRadius,
    radiusKm: config.radiusKm,
  }
}
