import 'server-only'
import type { NextResponse } from 'next/server'
import { APP_PLACES_MAX, appPlacesQuerySchema, type AppPlace, type AppPlacesResult } from '@/lib/app-contract'
import type { AppRouteContext } from '@/lib/app-api/app-route'
import { appFail, appOk } from '@/lib/app-api/respond'
import { AppReadError, readActiveOutlets } from '@/lib/app-api/store-reads'
import { toLatLng, type LatLng } from '@/lib/delivery-fee'
import type { ServerPlace } from '@/lib/maps/apple/maps-server-api'
import { readMapKitConfig } from '@/lib/maps/apple/mapkit-token'
import { appleMapsClientFor } from '@/lib/maps/apple/server-client'
import { isMultiBranchEnabled } from '@/lib/outlets/multi-branch-flag'
import { getStorefrontTenant } from '@/lib/storefront/storefront-tenant'
import { gateAppCustomer, type CustomerBudgets } from './customer-gate'

/**
 * GET /api/app/v1/places?q=&outletId= — the delivery address type-ahead.
 *
 * The same Apple Maps Server API search the merchant register uses
 * (`/api/maps/places`), biased to the chosen branch's pin, else the store's.
 * Lower budgets than the register's: a customer types one address, a cashier
 * types dozens a day.
 */

export const PLACES_BUDGETS: CustomerBudgets = {
  bucket: 'app-places',
  burst: { limit: 30, windowSec: 60 },
  daily: { limit: 300, windowSec: 86_400 },
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const SEARCH_UNAVAILABLE = 'Address search is unavailable right now. Type your address instead.'
const BAD_QUERY = 'Type at least 3 characters to search.'

/** Apple names a plain address after its street line; only a real place keeps its name. */
export function toAppPlace(place: ServerPlace): AppPlace | null {
  const address = place.address.trim()
  if (!address) return null
  const name = place.name?.trim() || null
  const firstLine = address.split(', ')[0]
  return {
    name: name && name !== address && name !== firstLine ? name : null,
    address,
    lat: place.coordinates.lat,
    lng: place.coordinates.lng,
  }
}

export function toAppPlaces(places: readonly ServerPlace[]): AppPlacesResult {
  const mapped = places.map(toAppPlace).filter((place): place is AppPlace => place !== null)
  return { places: mapped.slice(0, APP_PLACES_MAX) }
}

/** The chosen branch's pin when it is one of this store's active branches, else the store pin. */
async function searchBias(app: AppRouteContext['app'], outletId: string | null): Promise<LatLng | undefined> {
  const { tenant, error } = await getStorefrontTenant(app.slug)
  if (error) throw new AppReadError('the store', error)
  if (!tenant || tenant.id !== app.tenantId) return undefined
  if (outletId && isMultiBranchEnabled(tenant)) {
    const outlet = (await readActiveOutlets(app.tenantId)).find((candidate) => candidate.id === outletId)
    const outletPin = outlet ? toLatLng(outlet.latitude, outlet.longitude) : null
    if (outletPin) return outletPin
  }
  return toLatLng(tenant.restaurant_latitude, tenant.restaurant_longitude) ?? undefined
}

export async function handlePlaces(context: AppRouteContext): Promise<NextResponse> {
  const gate = await gateAppCustomer(context, PLACES_BUDGETS)
  if (!gate.ok) return gate.response

  const params = context.request.nextUrl.searchParams
  const parsed = appPlacesQuerySchema.safeParse({ q: params.get('q') ?? '', outletId: params.get('outletId') || null })
  if (!parsed.success) return appFail('bad_request', BAD_QUERY)

  const config = readMapKitConfig()
  if (!config) return appFail('unavailable', SEARCH_UNAVAILABLE)

  const near = await searchBias(context.app, parsed.data.outletId)
  let places: ServerPlace[]
  try {
    places = await appleMapsClientFor(config).search(parsed.data.q, near)
  } catch (error) {
    console.error('[app-api:places] Apple Maps search failed:', error instanceof Error ? error.message : error)
    return appFail('unavailable', SEARCH_UNAVAILABLE)
  }
  return appOk(toAppPlaces(places), { headers: NO_STORE })
}
