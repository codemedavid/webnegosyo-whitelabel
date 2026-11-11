import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { gateAppMapsRequest, latLngSchema, mapsFail, NO_STORE } from '@/lib/maps/app-maps-request'
import {
  DISTANCE_PRICING_COLUMNS,
  quoteDistanceFromOrigin,
  type DistancePricedStore,
} from '@/lib/delivery/distance-quote-server'

/**
 * POST /api/maps/delivery-quote — the fee the storefront would charge to
 * deliver to a pinned spot, for the merchant app's register to SUGGEST.
 *
 * Exactly the checkout's pricing (`calculateDistanceDeliveryFeeAction`): road
 * distance from the branch's pin (when `outletId` names a pinned branch of this
 * store) or the store's, the same Redis-cached measurement, the same
 * max(minimum, km × rate) — so a phoned-in delivery and a web order to the
 * same door cost the same. The free-delivery minimum depends on the cart and
 * is applied on the device.
 *
 * Body: `{ tenantId, at, outletId? }`. 409 when the store does not price by distance
 * (off, incomplete, or Lalamove), or has no pin.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  at: latLngSchema,
  outletId: z.string().uuid().nullish(),
})

const BUDGETS = {
  bucket: 'maps-quote',
  burst: { limit: 30, windowSec: 60 },
  daily: { limit: 1000, windowSec: 86_400 },
  // Road distance falls back to Mapbox, then to an estimate — no Apple key needed.
  requiresAppleMaps: false,
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return mapsFail(400, 'That delivery spot was not valid.')

  const { tenantId, at, outletId } = parsed.data
  const gate = await gateAppMapsRequest(request, tenantId, BUDGETS)
  if (!gate.ok) return gate.response

  const { data: tenant, error } = await gate.supabase
    .from('tenants')
    .select(DISTANCE_PRICING_COLUMNS)
    .eq('id', tenantId)
    .maybeSingle()
  if (error) {
    console.error('[maps-delivery-quote] tenant read failed:', error.message)
    return mapsFail(502, 'Could not read the store’s delivery pricing.')
  }
  if (!tenant) return mapsFail(404, 'Store not found.')

  try {
    const store = { ...(tenant as unknown as DistancePricedStore), id: tenantId }
    const outcome = await quoteDistanceFromOrigin(gate.supabase, store, outletId, at)
    if (outcome.kind === 'unpriced') return mapsFail(409, 'This store does not price delivery by distance.')
    if (outcome.kind === 'branch-unreadable') return mapsFail(502, 'Could not read the branch’s location.')
    if (outcome.kind === 'no-origin') return mapsFail(409, 'The store location has not been set.')

    return NextResponse.json(
      {
        fee: outcome.fee,
        distanceKm: outcome.distanceKm,
        withinRadius: outcome.withinRadius,
        radiusKm: outcome.radiusKm,
      },
      { headers: NO_STORE },
    )
  } catch (failure) {
    console.error('[maps-delivery-quote] quote failed:', failure instanceof Error ? failure.message : failure)
    return mapsFail(502, 'Could not work out the delivery fee.')
  }
}
