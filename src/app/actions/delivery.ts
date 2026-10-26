'use server'

/**
 * Server actions for distance-based delivery fee (non-Lalamove pricing path).
 *
 * Mirrors the Lalamove quotation action (`createQuotationAction`) but computes the fee
 * locally from the store↔customer DRIVING distance and the tenant's configured
 * radius / per-km rate / minimum fee. Lalamove always takes precedence when enabled, so
 * this action refuses to price when `lalamove_enabled` is true.
 *
 * The order action recomputes the fee with the same cached road measurement
 * (`resolveOrderDeliveryFee`), so the order is billed what this quote showed.
 */

import { createClient } from '@/lib/supabase/server'
import { distanceConfigFromTenant, quoteDistanceDelivery, toLatLng } from '@/lib/delivery-fee'
import { measureRoadDistanceKm } from '@/lib/maps/road-distance-server'
import { checkRateLimit } from '@/lib/distributed-rate-limit'
import { checkActionRateLimit } from '@/lib/action-rate-limit'

export interface DistanceDeliveryQuoteResult {
  fee: number
  distanceKm: number
  withinRadius: boolean
  radiusKm: number
}

type DistanceDeliveryQuoteResponse = { success: boolean; data?: DistanceDeliveryQuoteResult; error?: string }

// Only the columns needed for pricing — never the secret lalamove_* keys, since this
// is a public (anon) endpoint.
const PRICING_COLUMNS =
  'lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, restaurant_latitude, restaurant_longitude'

/**
 * Anonymous, and every call may spend a paid road-distance lookup. Same caps as
 * the Lalamove quotation (`createQuotationAction`): per client IP so one visitor
 * cannot use up the store's budget, per store to bound the spend. Both fail
 * open — a Redis outage must not take delivery quotes away from customers.
 */
const DISTANCE_FEE_RATE_LIMIT = { limit: 30, windowSec: 60 }
const DISTANCE_FEE_CLIENT_RATE_LIMIT = { limit: 10, windowSec: 60 }

const QUOTE_RATE_LIMITED: DistanceDeliveryQuoteResponse = {
  success: false,
  error: 'Too many delivery quotes requested. Please try again in a moment.',
}

/**
 * Compute the distance-based delivery fee for a customer's selected address.
 * Returns `{ success: true, data }` with the fee + range info, or `{ success: false, error }`.
 */
export async function calculateDistanceDeliveryFeeAction(
  tenantId: string,
  deliveryLat: number,
  deliveryLng: number
): Promise<DistanceDeliveryQuoteResponse> {
  try {
    const destination = toLatLng(deliveryLat, deliveryLng)
    if (!destination) {
      return { success: false, error: 'Invalid delivery coordinates' }
    }
    if (typeof tenantId !== 'string' || tenantId === '') {
      return { success: false, error: 'Restaurant not found' }
    }

    const clientRate = await checkActionRateLimit('distance-fee-client', DISTANCE_FEE_CLIENT_RATE_LIMIT)
    if (!clientRate.allowed) return QUOTE_RATE_LIMITED

    const rate = await checkRateLimit(`distance-fee:${tenantId}`, DISTANCE_FEE_RATE_LIMIT)
    if (!rate.allowed) return QUOTE_RATE_LIMITED

    const supabase = await createClient()
    const { data: tenant, error } = await supabase.from('tenants').select(PRICING_COLUMNS).eq('id', tenantId).single()
    if (error || !tenant) {
      return { success: false, error: 'Restaurant not found' }
    }

    // Lalamove wins when enabled — this path is only for tenants that opted out of Lalamove.
    if (tenant.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is enabled for this restaurant' }
    }

    const config = distanceConfigFromTenant(tenant)
    if (!config) {
      return { success: false, error: 'Distance-based delivery is not configured for this restaurant' }
    }

    const outcome = await quoteDistanceDelivery({
      config,
      store: toLatLng(tenant.restaurant_latitude, tenant.restaurant_longitude),
      destination,
      measureKm: measureRoadDistanceKm,
    })
    if (outcome.kind !== 'quote') {
      return { success: false, error: 'The store location has not been configured' }
    }

    return {
      success: true,
      data: {
        fee: outcome.quote.fee,
        distanceKm: outcome.quote.distanceKm,
        withinRadius: outcome.quote.withinRadius,
        radiusKm: config.radiusKm,
      },
    }
  } catch (error) {
    // Public endpoint: log the detail, show the customer a generic message.
    console.error('Distance delivery fee error:', error)
    return { success: false, error: 'Failed to calculate delivery fee' }
  }
}
