'use server'

/**
 * Server actions for distance-based delivery fee (non-Lalamove pricing path).
 *
 * Mirrors the Lalamove quotation action (`createQuotationAction`) but computes the fee
 * locally from the branch-or-store↔customer DRIVING distance and the tenant's configured
 * radius / per-km rate / minimum fee. Lalamove always takes precedence when enabled, so
 * this action refuses to price when `lalamove_enabled` is true.
 *
 * The order action recomputes the fee with the same cached road measurement
 * (`resolveOrderDeliveryFee`), so the order is billed what this quote showed.
 */

import { createClient } from '@/lib/supabase/server'
import { toLatLng } from '@/lib/delivery-fee'
import {
  DISTANCE_PRICING_COLUMNS,
  quoteDistanceFromOrigin,
  type DistancePricedStore,
} from '@/lib/delivery/distance-quote-server'
import { INVALID_BRANCH_MESSAGE, isClientOutletIdValid } from '@/lib/delivery/delivery-origin-server'

export interface DistanceDeliveryQuoteResult {
  fee: number
  distanceKm: number
  withinRadius: boolean
  radiusKm: number
}

type DistanceDeliveryQuoteResponse = { success: boolean; data?: DistanceDeliveryQuoteResult; error?: string }

const UNPRICED_ERROR = 'Distance-based delivery is not configured for this restaurant'
const LALAMOVE_ERROR = 'Lalamove delivery is enabled for this restaurant'

/**
 * Compute the distance-based delivery fee for a customer's selected address,
 * measured from the chosen branch (`outletId`) when it is pinned, else from the
 * store. Returns `{ success: true, data }` with the fee + range info, or
 * `{ success: false, error }`.
 */
export async function calculateDistanceDeliveryFeeAction(
  tenantId: string,
  deliveryLat: number,
  deliveryLng: number,
  outletId: string | null = null
): Promise<DistanceDeliveryQuoteResponse> {
  try {
    const destination = toLatLng(deliveryLat, deliveryLng)
    if (!destination) {
      return { success: false, error: 'Invalid delivery coordinates' }
    }
    if (!isClientOutletIdValid(outletId)) {
      return { success: false, error: INVALID_BRANCH_MESSAGE }
    }

    // Only the columns needed for pricing — never the secret lalamove_* keys,
    // since this is a public (anon) endpoint.
    const supabase = await createClient()
    const { data: tenant, error } = await supabase.from('tenants').select(DISTANCE_PRICING_COLUMNS).eq('id', tenantId).single()
    if (error || !tenant) {
      return { success: false, error: 'Restaurant not found' }
    }
    const store = tenant as unknown as DistancePricedStore

    const outcome = await quoteDistanceFromOrigin(supabase, store, outletId, destination)
    if (outcome.kind === 'unpriced') {
      // Lalamove wins when enabled — this path is only for tenants that opted out of Lalamove.
      return { success: false, error: store.lalamove_enabled ? LALAMOVE_ERROR : UNPRICED_ERROR }
    }
    if (outcome.kind === 'branch-unreadable') {
      return { success: false, error: 'We could not check the branch for this delivery. Please try again.' }
    }
    if (outcome.kind === 'no-origin') {
      return { success: false, error: 'The store location has not been configured' }
    }

    return {
      success: true,
      data: {
        fee: outcome.fee,
        distanceKm: outcome.distanceKm,
        withinRadius: outcome.withinRadius,
        radiusKm: outcome.radiusKm,
      },
    }
  } catch (error) {
    // Public endpoint: log the detail, show the customer a generic message.
    console.error('Distance delivery fee error:', error)
    return { success: false, error: 'Failed to calculate delivery fee' }
  }
}
