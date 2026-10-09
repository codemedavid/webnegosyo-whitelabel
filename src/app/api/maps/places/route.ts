import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { gateAppMapsRequest, latLngSchema, mapsFail, NO_STORE } from '@/lib/maps/app-maps-request'
import { createAppleMapsClient, type AppleMapsClient, type ServerPlace } from '@/lib/maps/apple/maps-server-api'
import type { MapKitConfig } from '@/lib/maps/apple/mapkit-token'

/**
 * POST /api/maps/places — address search for the merchant app's register.
 *
 * Body: `{ tenantId, query, near? }` searches (addresses AND places, so a
 * landmark like "SM North EDSA" resolves), `{ tenantId, at }` names a point.
 * Same Apple Maps Server API the web's server geocoding uses, so the counter
 * and the storefront agree on what an address is.
 *
 * Bearer-authenticated as a member of the store; per-person limits because
 * every call spends the shared Apple quota.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_PLACES = 6

const bodySchema = z.union([
  z.object({
    tenantId: z.string().uuid(),
    query: z.string().trim().min(2).max(200),
    near: latLngSchema.optional(),
  }),
  z.object({
    tenantId: z.string().uuid(),
    at: latLngSchema,
  }),
])

const BUDGETS = {
  bucket: 'maps-places',
  burst: { limit: 40, windowSec: 60 },
  daily: { limit: 1500, windowSec: 86_400 },
}

/** One client per runtime, so Apple's 30-minute access token is reused. */
let cachedClient: { config: MapKitConfig; client: AppleMapsClient } | null = null

function clientFor(config: MapKitConfig): AppleMapsClient {
  if (cachedClient?.config.keyId !== config.keyId) {
    cachedClient = { config, client: createAppleMapsClient(config) }
  }
  return cachedClient.client
}

interface AppPlace {
  name: string | null
  address: string
  lat: number
  lng: number
}

function toAppPlace(place: ServerPlace): AppPlace {
  return {
    name: place.name,
    address: place.address,
    lat: place.coordinates.lat,
    lng: place.coordinates.lng,
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return mapsFail(400, 'Enter at least 2 characters to search.')

  const body = parsed.data
  const gate = await gateAppMapsRequest(request, body.tenantId, BUDGETS)
  if (!gate.ok) return gate.response
  if (!gate.config) return mapsFail(503, 'Maps are not available right now.')

  try {
    const client = clientFor(gate.config)
    const places = 'query' in body
      ? await client.search(body.query, body.near)
      : await client.reverseGeocode(body.at)
    return NextResponse.json(
      { places: places.slice(0, MAX_PLACES).map(toAppPlace) },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error('[maps-places] Apple Maps lookup failed:', error instanceof Error ? error.message : error)
    return mapsFail(502, 'Address search is unavailable. Type the address instead.')
  }
}
