import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { gateAppMapsRequest, latLngSchema, mapsFail, NO_STORE } from '@/lib/maps/app-maps-request'
import { distanceConfigFromTenant, quoteDistanceDelivery, toLatLng } from '@/lib/delivery-fee'
import { measureRoadDistanceKm } from '@/lib/maps/road-distance-server'

/**
 * POST /api/maps/delivery-quote — the fee the storefront would charge to
 * deliver to a pinned spot, for the merchant app's register to SUGGEST.
 *
 * Exactly the checkout's pricing (`calculateDistanceDeliveryFeeAction`): road
 * distance from the store's pin, the same Redis-cached measurement, the same
 * max(minimum, km × rate) — so a phoned-in delivery and a web order to the
 * same door cost the same. The free-delivery minimum depends on the cart and
 * is applied on the device.
 *
 * Body: `{ tenantId, at }`. 409 when the store does not price by distance
 * (off, incomplete, or Lalamove), or has no pin.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  at: latLngSchema,
})

const BUDGETS = {
  bucket: 'maps-quote',
  burst: { limit: 30, windowSec: 60 },
  daily: { limit: 1000, windowSec: 86_400 },
  // Road distance falls back to Mapbox, then to an estimate — no Apple key needed.
  requiresAppleMaps: false,
}

const PRICING_COLUMNS =
  'lalamove_enabled, distance_delivery_enabled, delivery_price_per_km, delivery_min_fee, delivery_radius_km, restaurant_latitude, restaurant_longitude'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return mapsFail(400, 'That delivery spot was not valid.')

  const { tenantId, at } = parsed.data
  const gate = await gateAppMapsRequest(request, tenantId, BUDGETS)
  if (!gate.ok) return gate.response

  const { data: tenant, error } = await gate.supabase
    .from('tenants')
    .select(PRICING_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('[maps-delivery-quote] tenant read failed:', error.message)
    return mapsFail(502, 'Could not read the store’s delivery pricing.')
  }
  if (!tenant) return mapsFail(404, 'Store not found.')

  const config = distanceConfigFromTenant(tenant)
  if (!config) return mapsFail(409, 'This store does not price delivery by distance.')

  try {
    const outcome = await quoteDistanceDelivery({
      config,
      store: toLatLng(tenant.restaurant_latitude, tenant.restaurant_longitude),
      destination: at,
      measureKm: measureRoadDistanceKm,
    })
    if (outcome.kind !== 'quote') return mapsFail(409, 'The store location has not been set.')

    return NextResponse.json(
      {
        fee: outcome.quote.fee,
        distanceKm: outcome.quote.distanceKm,
        withinRadius: outcome.quote.withinRadius,
        radiusKm: config.radiusKm,
      },
      { headers: NO_STORE },
    )
  } catch (failure) {
    console.error('[maps-delivery-quote] quote failed:', failure instanceof Error ? failure.message : failure)
    return mapsFail(502, 'Could not work out the delivery fee.')
  }
}
