import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { LngLat } from '@/lib/geocoding/mapbox-feature'
import { createAppleMapsClient } from '@/lib/maps/apple/maps-server-api'
import { readMapKitConfig } from '@/lib/maps/apple/mapkit-token'
import { getMapsProvider, type MapsProvider } from '@/lib/maps/provider'
import { batchGeocodeAddresses } from '@/lib/superadmin/client-map/geocode'
import { geocodeAddressesWithApple } from '@/lib/superadmin/client-map/geocode-apple'
import {
  pickAddressesToGeocode,
  resolveClientLocations,
  spreadCoincidentPins,
  summarizeClientMap,
  type BranchPoint,
  type ClientMapSummary,
  type ClientMapTenantRow,
  type ClientPin,
  type UnmappedClient,
} from '@/lib/superadmin/client-map/locate'

export interface ClientMapData {
  pins: ClientPin[]
  unmapped: UnmappedClient[]
  summary: ClientMapSummary
  /** True when address geocoding failed this load, so address-only clients are unplaced. */
  isGeocodingDegraded: boolean
}

const GEOCODE_CACHE_SECONDS = 24 * 60 * 60

const TENANT_COLUMNS =
  'id, name, slug, logo_url, primary_color, domain, created_at, restaurant_address, footer_address, restaurant_latitude, restaurant_longitude'

async function geocodeWith(provider: MapsProvider, addresses: string[]): Promise<Record<string, LngLat>> {
  if (provider === 'mapbox') {
    return batchGeocodeAddresses(addresses, process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '')
  }
  const config = readMapKitConfig()
  if (!config) throw new Error('Apple Maps is not configured (APPLE_MAPKIT_* env vars)')
  return geocodeAddressesWithApple(addresses, createAppleMapsClient(config))
}

/**
 * Keyed by provider and the sorted address list, so a new client re-geocodes
 * the batch once. A throw is never cached — the next load retries.
 */
const getCachedGeocodes = unstable_cache(
  async (addresses: string[], provider: MapsProvider): Promise<Record<string, LngLat>> => geocodeWith(provider, addresses),
  ['superadmin-client-map-geocode-v3'],
  { revalidate: GEOCODE_CACHE_SECONDS },
)

async function loadBranches(supabase: Awaited<ReturnType<typeof createClient>>): Promise<BranchPoint[]> {
  const { data, error } = await supabase
    .from('outlets')
    .select('tenant_id, latitude, longitude')
    .eq('is_active', true)
    .not('latitude', 'is', null)
    .order('sort_order', { ascending: true })

  if (error) {
    // Branches only refine placement; the map still renders without them.
    console.error('[client-map] failed to load branches:', error.message)
    return []
  }
  return (data ?? []).map((row) => ({
    tenantId: row.tenant_id as string,
    latitude: row.latitude as number | null,
    longitude: row.longitude as number | null,
  }))
}

async function loadGeocodes(addresses: string[]): Promise<{ geocoded: Record<string, LngLat>; failed: boolean }> {
  if (addresses.length === 0) return { geocoded: {}, failed: false }
  try {
    return { geocoded: await getCachedGeocodes(addresses, getMapsProvider()), failed: false }
  } catch (error) {
    console.error('[client-map] address geocoding failed:', error)
    return { geocoded: {}, failed: true }
  }
}

/** Every active client, placed on the map where possible. Superadmin only (RLS + route gate). */
export async function getClientMapData(): Promise<ClientMapData> {
  const supabase = await createClient()

  const [tenantsResult, branches] = await Promise.all([
    supabase.from('tenants').select(TENANT_COLUMNS).eq('is_active', true).order('created_at', { ascending: false }),
    loadBranches(supabase),
  ])

  if (tenantsResult.error) {
    throw new Error(`Failed to load clients for the map: ${tenantsResult.error.message}`)
  }

  const rows = (tenantsResult.data ?? []) as unknown as ClientMapTenantRow[]
  const { geocoded, failed } = await loadGeocodes(pickAddressesToGeocode(rows, branches))
  const { pins, unmapped } = resolveClientLocations(rows, branches, geocoded)

  return {
    pins: spreadCoincidentPins(pins),
    unmapped,
    summary: summarizeClientMap(pins, unmapped, new Date()),
    isGeocodingDegraded: failed,
  }
}
