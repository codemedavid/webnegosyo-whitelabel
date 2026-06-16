'use server'

/**
 * Server actions for distance-based delivery fee (non-Lalamove pricing path).
 *
 * Mirrors the Lalamove quotation action (`createQuotationAction`) but computes the fee
 * locally from the store↔customer straight-line distance and the tenant's configured
 * radius / per-km rate / minimum fee. Lalamove always takes precedence when enabled, so
 * this action refuses to price when `lalamove_enabled` is true.
 */

import { createClient } from '@/lib/supabase/server'
import type { Tenant } from '@/types/database'
import { resolveDistanceDeliveryConfig, quoteDistanceDelivery } from '@/lib/delivery-fee'

export interface DistanceDeliveryQuoteResult {
  fee: number
  distanceKm: number
  withinRadius: boolean
  radiusKm: number
}

/**
 * Compute the distance-based delivery fee for a customer's selected address.
 * Returns `{ success: true, data }` with the fee + range info, or `{ success: false, error }`.
 */
export async function calculateDistanceDeliveryFeeAction(
  tenantId: string,
  deliveryLat: number,
  deliveryLng: number
): Promise<{ success: boolean; data?: DistanceDeliveryQuoteResult; error?: string }> {
  try {
    if (!Number.isFinite(deliveryLat) || !Number.isFinite(deliveryLng)) {
      return { success: false, error: 'Invalid delivery coordinates' }
    }

    const supabase = await createClient()
    // Select only the columns needed for pricing — never the secret lalamove_* keys, since this
    // is a public (anon) endpoint.
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, restaurant_latitude, restaurant_longitude')
      .eq('id', tenantId)
      .single()

    if (error || !tenant) {
      return { success: false, error: 'Restaurant not found' }
    }

    const t = tenant as unknown as Pick<
      Tenant,
      | 'lalamove_enabled'
      | 'distance_delivery_enabled'
      | 'delivery_price_per_km'
      | 'delivery_min_fee'
      | 'delivery_radius_km'
      | 'restaurant_latitude'
      | 'restaurant_longitude'
    >

    // Lalamove wins when enabled — this path is only for tenants that opted out of Lalamove.
    if (t.lalamove_enabled) {
      return { success: false, error: 'Lalamove delivery is enabled for this restaurant' }
    }

    const config = resolveDistanceDeliveryConfig({
      enabled: t.distance_delivery_enabled,
      perKm: t.delivery_price_per_km,
      minFee: t.delivery_min_fee,
      radiusKm: t.delivery_radius_km,
    })
    if (!config) {
      return { success: false, error: 'Distance-based delivery is not configured for this restaurant' }
    }

    const storeLat = Number(t.restaurant_latitude)
    const storeLng = Number(t.restaurant_longitude)
    if (!Number.isFinite(storeLat) || !Number.isFinite(storeLng)) {
      return { success: false, error: 'The store location has not been configured' }
    }

    const quote = quoteDistanceDelivery(
      { lat: storeLat, lng: storeLng },
      { lat: deliveryLat, lng: deliveryLng },
      config
    )

    return {
      success: true,
      data: {
        fee: quote.fee,
        distanceKm: quote.distanceKm,
        withinRadius: quote.withinRadius,
        radiusKm: config.radiusKm,
      },
    }
  } catch (error) {
    console.error('Distance delivery fee error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate delivery fee',
    }
  }
}
