/**
 * Places every live client on the superadmin Client Map.
 *
 * Only ~a quarter of tenants have saved coordinates (they come from the delivery
 * address picker); most have only a typed address. So a client's pin is resolved
 * by precedence: saved restaurant coordinates → first branch with coordinates →
 * geocoded address (restaurant address, else the storefront footer address).
 * Geocoded pins are approximate (barangay/city level) and are never written
 * back — `restaurant_latitude/longitude` drive delivery fees.
 *
 * Pure: no I/O, so the whole placement is unit-tested.
 */

import type { LngLat } from '@/lib/geocoding/mapbox-feature'

export type PinSource = 'saved' | 'branch' | 'address'
export type UnmappedReason = 'no_address' | 'address_not_found'

/** The tenant columns the map reads. Numeric columns may arrive as strings. */
export interface ClientMapTenantRow {
  id: string
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  domain: string | null
  created_at: string
  restaurant_address: string | null
  footer_address: string | null
  restaurant_latitude: number | string | null
  restaurant_longitude: number | string | null
}

export interface BranchPoint {
  tenantId: string
  latitude: number | string | null
  longitude: number | string | null
}

interface ClientBase {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  color: string
  createdAt: string
  address: string | null
}

export interface ClientPin extends ClientBase {
  domain: string | null
  lng: number
  lat: number
  source: PinSource
  branchCount: number
}

export interface UnmappedClient extends ClientBase {
  reason: UnmappedReason
}

export interface ClientMapSummary {
  total: number
  mapped: number
  exact: number
  newThisMonth: number
}

const MIN_ADDRESS_LENGTH = 3
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FALLBACK_COLOR = '#ffffff'
const TRAILING_JUNK = /\s*contact\s+info\s*$/i
/** Form placeholders people type instead of an address. */
const PLACEHOLDER = /^(n\s*\/?\s*a|none|null|nil|tba|tbd|-+|\.+)$/i
const NEW_CLIENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
/** Stores sharing an identical point are fanned ~90 m apart so they can un-cluster. */
const COINCIDENT_STEP_DEGREES = 0.0008
const COINCIDENT_PRECISION = 5
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

function toFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** [lng, lat] from lat/lng columns, or null when missing, out of range or 0,0. */
export function toLngLat(lat: unknown, lng: unknown): LngLat | null {
  const la = toFinite(lat)
  const lo = toFinite(lng)
  if (la === null || lo === null) return null
  if (la === 0 && lo === 0) return null
  if (Math.abs(la) > 90 || Math.abs(lo) > 180) return null
  return [lo, la]
}

export function cleanAddressForGeocoding(address: string | null | undefined): string | null {
  if (!address) return null
  const cleaned = address
    .replace(TRAILING_JUNK, '')
    .replace(/\s+/g, ' ')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ')
  if (cleaned.length < MIN_ADDRESS_LENGTH || PLACEHOLDER.test(cleaned)) return null
  return cleaned
}

/** The address a client is located by: the restaurant address, else the footer one. */
function addressOf(row: ClientMapTenantRow): string | null {
  return cleanAddressForGeocoding(row.restaurant_address) ?? cleanAddressForGeocoding(row.footer_address)
}

function safeColor(color: string | null): string {
  return color && HEX_COLOR.test(color.trim()) ? color.trim() : FALLBACK_COLOR
}

function groupBranches(branches: BranchPoint[]): Map<string, LngLat[]> {
  return branches.reduce((acc, branch) => {
    const point = toLngLat(branch.latitude, branch.longitude)
    if (!point) return acc
    const existing = acc.get(branch.tenantId) ?? []
    return new Map(acc).set(branch.tenantId, [...existing, point])
  }, new Map<string, LngLat[]>())
}

function knownLocation(row: ClientMapTenantRow, branchPoints: LngLat[]): [LngLat, PinSource] | null {
  const saved = toLngLat(row.restaurant_latitude, row.restaurant_longitude)
  if (saved) return [saved, 'saved']
  if (branchPoints.length > 0) return [branchPoints[0], 'branch']
  return null
}

/** Addresses that still need geocoding — unique and sorted, so the cache key is stable. */
export function pickAddressesToGeocode(rows: ClientMapTenantRow[], branches: BranchPoint[]): string[] {
  const byTenant = groupBranches(branches)
  const addresses = rows
    .filter((row) => !knownLocation(row, byTenant.get(row.id) ?? []))
    .map(addressOf)
    .filter((address): address is string => address !== null)
  return [...new Set(addresses)].sort()
}

function toBase(row: ClientMapTenantRow): ClientBase {
  return {
    id: row.id,
    name: row.name.trim(),
    slug: row.slug,
    logoUrl: row.logo_url || null,
    color: safeColor(row.primary_color),
    createdAt: row.created_at,
    address: row.restaurant_address?.trim() || row.footer_address?.trim() || null,
  }
}

export function resolveClientLocations(
  rows: ClientMapTenantRow[],
  branches: BranchPoint[],
  geocoded: Record<string, LngLat>,
): { pins: ClientPin[]; unmapped: UnmappedClient[] } {
  const byTenant = groupBranches(branches)

  return rows.reduce<{ pins: ClientPin[]; unmapped: UnmappedClient[] }>(
    (acc, row) => {
      const branchPoints = byTenant.get(row.id) ?? []
      const cleaned = addressOf(row)
      const geocodedPoint = cleaned ? geocoded[cleaned] : undefined
      const located: [LngLat, PinSource] | null =
        knownLocation(row, branchPoints) ?? (geocodedPoint ? [geocodedPoint, 'address'] : null)

      if (!located) {
        const reason: UnmappedReason = cleaned ? 'address_not_found' : 'no_address'
        return { ...acc, unmapped: [...acc.unmapped, { ...toBase(row), reason }] }
      }

      const [[lng, lat], source] = located
      const pin: ClientPin = {
        ...toBase(row),
        domain: row.domain || null,
        lng,
        lat,
        source,
        branchCount: branchPoints.length,
      }
      return { ...acc, pins: [...acc.pins, pin] }
    },
    { pins: [], unmapped: [] },
  )
}

/**
 * Several addresses resolve to the very same point (a barangay centre). Identical
 * points never split out of a cluster, so the 2nd..nth are fanned out by ~90 m —
 * well inside the precision of a barangay-level match.
 */
export function spreadCoincidentPins(pins: ClientPin[]): ClientPin[] {
  const seen = new Map<string, number>()
  return pins.map((pin) => {
    const key = `${pin.lng.toFixed(COINCIDENT_PRECISION)},${pin.lat.toFixed(COINCIDENT_PRECISION)}`
    const index = seen.get(key) ?? 0
    seen.set(key, index + 1)
    if (index === 0) return pin
    const radius = COINCIDENT_STEP_DEGREES * Math.sqrt(index)
    const angle = index * GOLDEN_ANGLE
    return { ...pin, lng: pin.lng + radius * Math.cos(angle), lat: pin.lat + radius * Math.sin(angle) }
  })
}

export function isNewClient(createdAt: string, now: Date): boolean {
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && now.getTime() - created <= NEW_CLIENT_WINDOW_MS
}

export function summarizeClientMap(
  pins: ClientPin[],
  unmapped: UnmappedClient[],
  now: Date,
): ClientMapSummary {
  const everyone = [...pins, ...unmapped]
  return {
    total: everyone.length,
    mapped: pins.length,
    exact: pins.filter((pin) => pin.source !== 'address').length,
    newThisMonth: everyone.filter((client) => isNewClient(client.createdAt, now)).length,
  }
}
