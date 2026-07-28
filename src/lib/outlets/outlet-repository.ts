/**
 * The one way anything in the app reads or writes outlets.
 *
 * No component, page, or route handler talks to a database for outlet data —
 * they go through this interface. Today it has one real implementation
 * (platform Supabase, where every other catalog/config entity already lives)
 * plus an in-memory one for tests. That is deliberate: outlets are
 * configuration, not order data, so they do not belong in the per-tenant Convex
 * deployments, which hold orders/analytics only and reach tenants through a
 * manual schema-deploy pipeline. Keeping the seam here means a second backend
 * can be added later without touching a single caller.
 *
 * Validation lives in this module rather than in an implementation, so every
 * backend rejects exactly the same inputs and no path can persist a slug the
 * router cannot serve.
 */

import { validateOutletSlug } from '@/lib/outlets/reserved-slugs'
import type { Outlet, OutletOperatingHours } from '@/types/database'

export type { Outlet } from '@/types/database'

/**
 * Columns every implementation must return.
 *
 * Spelled out rather than `*` for the same reason the storefront tenant fetch
 * is: a column the app reads but the query never selects silently resolves to
 * `undefined` at runtime, which has broken live features in this codebase
 * before. The projection test asserts this list matches the type.
 */
export const OUTLET_SELECT = `
  id, tenant_id, name, slug, address, image_url, latitude, longitude, phone,
  operating_hours, timezone, supports_pickup, supports_delivery, supports_dine_in,
  delivery_radius_km, is_active, sort_order, created_at, updated_at
`

/** Everything a caller supplies to create an outlet. */
export interface OutletWriteInput {
  name: string
  slug: string
  address: string | null
  /** Optional storefront photo for the branch chooser card. */
  image_url: string | null
  latitude: number | null
  longitude: number | null
  phone: string | null
  operating_hours: OutletOperatingHours | null
  timezone: string | null
  supports_pickup: boolean
  supports_delivery: boolean
  supports_dine_in: boolean
  delivery_radius_km: number | null
  is_active: boolean
  sort_order: number
}

/** A partial edit. Absent keys are left exactly as they are. */
export type OutletPatch = Partial<OutletWriteInput>

export interface OutletRepository {
  /** Every outlet for a tenant, active or not, in merchant-defined order. */
  listByTenant(tenantId: string): Promise<Outlet[]>
  /** Only outlets a customer may currently choose. */
  listActiveByTenant(tenantId: string): Promise<Outlet[]>
  /** Look up by URL slug (case-insensitive). Includes inactive outlets. */
  findBySlug(tenantId: string, slug: string): Promise<Outlet | null>
  findById(tenantId: string, id: string): Promise<Outlet | null>
  create(tenantId: string, input: OutletWriteInput): Promise<Outlet>
  update(tenantId: string, id: string, patch: OutletPatch): Promise<Outlet>
  /** Persist a new manual ordering. Ids from other tenants are ignored. */
  reorder(tenantId: string, orderedIds: readonly string[]): Promise<void>
}

/** Raised for input a merchant can fix; safe to show verbatim in the UI. */
export class OutletValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutletValidationError'
  }
}

/** Raised when an outlet does not exist for this tenant. */
export class OutletNotFoundError extends Error {
  constructor(message = 'Branch not found.') {
    super(message)
    this.name = 'OutletNotFoundError'
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * Validate and normalize a full or partial outlet write.
 *
 * Returns the normalized subset of fields that were present, so `update` can
 * merge it over the stored row without resurrecting absent keys.
 */
export function normalizeOutletWrite(patch: OutletPatch): OutletPatch {
  const normalized: OutletPatch = { ...patch }

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (name === '') throw new OutletValidationError('Branch name is required.')
    normalized.name = name
  }

  if (patch.slug !== undefined) {
    const result = validateOutletSlug(patch.slug)
    if (!result.ok) throw new OutletValidationError(result.error)
    normalized.slug = result.slug
  }

  // Only enforceable when every side is known; `update` merges first and
  // re-checks, so a patch that turns the last mode off is still caught. A patch
  // that leaves dine-in unmentioned cannot be judged here — the stored value may
  // well be true — so it falls through to the post-merge check.
  if (
    patch.supports_pickup === false &&
    patch.supports_delivery === false &&
    patch.supports_dine_in === false
  ) {
    throw new OutletValidationError('A branch must support dine-in, pickup, or delivery.')
  }

  if (patch.latitude !== undefined && patch.latitude !== null) {
    if (!isFiniteNumber(patch.latitude) || patch.latitude < -90 || patch.latitude > 90) {
      throw new OutletValidationError('Latitude must be between -90 and 90.')
    }
  }

  if (patch.longitude !== undefined && patch.longitude !== null) {
    if (!isFiniteNumber(patch.longitude) || patch.longitude < -180 || patch.longitude > 180) {
      throw new OutletValidationError('Longitude must be between -180 and 180.')
    }
  }

  if (patch.delivery_radius_km !== undefined && patch.delivery_radius_km !== null) {
    if (!isFiniteNumber(patch.delivery_radius_km) || patch.delivery_radius_km < 0) {
      throw new OutletValidationError('Delivery radius must be zero or more.')
    }
  }

  if (patch.address !== undefined && patch.address !== null) {
    normalized.address = patch.address.trim() || null
  }

  return normalized
}

/**
 * Cross-field checks that only make sense once the whole row is known.
 *
 * Half a coordinate pair is the one that matters: a latitude with no longitude
 * silently disables this branch for nearest-detection, which looks like a bug
 * in the feature rather than a gap in the merchant's data.
 */
export function assertOutletInvariants(outlet: {
  latitude: number | null
  longitude: number | null
  supports_pickup: boolean
  supports_delivery: boolean
  /** Optional so pre-dine-in callers compile; absent is read as false, never as permission. */
  supports_dine_in?: boolean
}): void {
  const hasLat = outlet.latitude !== null
  const hasLng = outlet.longitude !== null
  if (hasLat !== hasLng) {
    throw new OutletValidationError(
      'Set both latitude and longitude, or leave both blank.'
    )
  }
  // Mirrors the widened `outlets_fulfillment_ck`: a branch must be reachable by
  // at least one mode, or it can never be chosen for anything.
  if (!outlet.supports_pickup && !outlet.supports_delivery && outlet.supports_dine_in !== true) {
    throw new OutletValidationError('A branch must support dine-in, pickup, or delivery.')
  }
}

/** Merchant-defined ordering, with a stable tiebreak. */
export function compareOutlets(a: Outlet, b: Outlet): number {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  return a.name.localeCompare(b.name)
}
