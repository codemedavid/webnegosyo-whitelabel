/**
 * Pure form-mapping helpers for the branches admin manager.
 *
 * Same shape as `src/lib/inventory/inventory-form.ts`: the UI holds every field
 * as a string while it is being edited, and these helpers coerce a draft into
 * the validated repository input and back again for the edit dialog.
 *
 * One deliberate difference from the inventory helpers: a blank numeric field
 * becomes `null`, never `0`. Zero is a perfectly valid latitude, so defaulting
 * a blank coordinate to it would store a branch off the coast of Africa and
 * make nearest-branch detection look broken rather than unconfigured.
 */

import {
  assertOutletInvariants,
  normalizeOutletWrite,
  OutletValidationError,
  type OutletWriteInput,
} from '@/lib/outlets/outlet-repository'
import { slugifyOutletName } from '@/lib/outlets/reserved-slugs'
import type { Outlet, OutletOperatingHours } from '@/types/database'

export interface OutletDraft {
  name: string
  slug: string
  address: string
  latitude: string
  longitude: string
  phone: string
  timezone: string
  supports_pickup: boolean
  supports_delivery: boolean
  delivery_radius_km: string
  is_active: boolean
  // No editor yet — carried through verbatim so saving a branch never erases
  // hours the schema already supports.
  operating_hours: OutletOperatingHours | null
}

export const EMPTY_OUTLET_DRAFT: OutletDraft = {
  name: '',
  slug: '',
  address: '',
  latitude: '',
  longitude: '',
  phone: '',
  timezone: '',
  supports_pickup: true,
  supports_delivery: true,
  delivery_radius_km: '',
  is_active: true,
  operating_hours: null,
}

/** Blank string → null; trimmed value otherwise. */
function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Blank string → null; anything non-numeric is an error the merchant must fix.
 * `label` names the field so the message points at the offending input.
 */
function nullableNumber(value: string, label: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new OutletValidationError(`${label} must be a number.`)
  }
  return parsed
}

/** Value → blank input; used to fill the edit dialog. */
function textInput(value: string | null): string {
  return value ?? ''
}

function numberInput(value: number | null): string {
  return value === null ? '' : String(value)
}

/**
 * The slug this draft will actually be saved under, for live preview next to
 * the name field. Falls back to a name-derived suggestion while the merchant
 * has not typed one.
 */
export function previewOutletSlug(draft: OutletDraft): string {
  const fromTyped = slugifyOutletName(draft.slug)
  if (fromTyped !== '') return fromTyped
  return slugifyOutletName(draft.name)
}

/**
 * Convert a draft into a validated write. Throws `OutletValidationError` with a
 * message safe to show verbatim; the same validation the repository applies, so
 * the form never reports something the server would accept, or vice versa.
 */
export function buildOutletWriteInput(
  draft: OutletDraft,
  options: { sortOrder?: number } = {}
): OutletWriteInput {
  const candidate: OutletWriteInput = {
    name: draft.name,
    slug: previewOutletSlug(draft),
    address: nullableText(draft.address),
    latitude: nullableNumber(draft.latitude, 'Latitude'),
    longitude: nullableNumber(draft.longitude, 'Longitude'),
    phone: nullableText(draft.phone),
    operating_hours: draft.operating_hours,
    timezone: nullableText(draft.timezone),
    supports_pickup: draft.supports_pickup,
    supports_delivery: draft.supports_delivery,
    delivery_radius_km: nullableNumber(draft.delivery_radius_km, 'Delivery radius'),
    is_active: draft.is_active,
    sort_order: options.sortOrder ?? 0,
  }

  const normalized = { ...candidate, ...normalizeOutletWrite(candidate) }
  assertOutletInvariants(normalized)
  return normalized
}

/** Fill the edit dialog from a stored outlet. */
export function outletToDraft(outlet: Outlet): OutletDraft {
  return {
    name: outlet.name,
    slug: outlet.slug,
    address: textInput(outlet.address),
    latitude: numberInput(outlet.latitude),
    longitude: numberInput(outlet.longitude),
    phone: textInput(outlet.phone),
    timezone: textInput(outlet.timezone),
    supports_pickup: outlet.supports_pickup,
    supports_delivery: outlet.supports_delivery,
    delivery_radius_km: numberInput(outlet.delivery_radius_km),
    is_active: outlet.is_active,
    operating_hours: outlet.operating_hours,
  }
}

/**
 * Move one outlet a single position within the manual ordering, returning the
 * new id sequence to hand to `OutletRepository.reorder`. A move that would run
 * off either end is a no-op rather than an error — the buttons stay clickable
 * and simply do nothing at the boundary.
 */
export function moveOutletOrder(
  orderedIds: readonly string[],
  id: string,
  direction: 'up' | 'down'
): string[] {
  const ids = [...orderedIds]
  const from = ids.indexOf(id)
  if (from === -1) return ids

  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= ids.length) return ids

  ids[from] = ids[to]
  ids[to] = id
  return ids
}

// ──────────────────────────────────────────────────────────────────────────
// Pinning a branch on the map
// ──────────────────────────────────────────────────────────────────────────

/** Coordinates as `MapboxAddressAutocomplete` reports them. */
export interface PickedCoordinates {
  lat: number
  lng: number
}

/**
 * A coordinate the database will actually accept.
 *
 * `outlets_latitude_range_ck` / `outlets_longitude_range_ck` bound the values,
 * and NaN or Infinity would serialize into something the column rejects. A
 * coordinate that fails here is dropped rather than carried, because half a
 * pair violates `outlets_coordinates_paired_ck` and makes the whole branch
 * unsaveable.
 */
function isUsableCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit
}

/**
 * Apply an address chosen in the map picker to a branch draft.
 *
 * `MapboxAddressAutocomplete` fires on every keystroke without coordinates and
 * only on a picked result with them. So:
 *
 * - picked result → address and both coordinates are replaced together
 * - typing → the address updates and an existing pin is left alone, otherwise
 *   correcting a typo would silently unpin the branch
 *
 * Coordinates are written as a pair or not at all. Returns a new draft; the
 * input is never mutated.
 */
export function applyOutletAddressSelection(
  draft: OutletDraft,
  address: string,
  coordinates?: PickedCoordinates
): OutletDraft {
  const hasUsablePair =
    coordinates !== undefined &&
    isUsableCoordinate(coordinates.lat, 90) &&
    isUsableCoordinate(coordinates.lng, 180)

  if (!hasUsablePair) {
    // No coordinates offered, or ones the database would refuse: keep whatever
    // pin the branch already had.
    return { ...draft, address }
  }

  return {
    ...draft,
    address,
    latitude: String(coordinates.lat),
    longitude: String(coordinates.lng),
  }
}

/**
 * Drop the pin, keeping the typed address.
 *
 * Both halves go at once — clearing one would leave the pair the database
 * rejects.
 */
export function clearOutletCoordinates(draft: OutletDraft): OutletDraft {
  return { ...draft, latitude: '', longitude: '' }
}
