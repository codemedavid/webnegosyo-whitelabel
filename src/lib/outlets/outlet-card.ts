/**
 * Everything a branch card on the "Select Your Outlet" screen claims, decided
 * without React so the awkward cases are testable.
 *
 * The card makes three assertions a customer acts on — open or closed, when it
 * closes, and how to get there — and each is derived from a field a merchant
 * may have left blank. Every absence degrades to a card that still reads
 * correctly: unknown hours read as open (a merchant who filled nothing in has
 * not closed the branch), and an unlocatable branch simply loses its direction
 * link rather than offering a dead one.
 */

import { getStoreOpenStatus } from '@/lib/store-open-status'

/** The subset of an outlet row a card renders. */
export interface OutletCardSource {
  id: string
  slug: string
  name: string
  address: string | null
  image_url: string | null
  latitude: number | null
  longitude: number | null
  operating_hours: unknown
  timezone: string | null
}

export interface OutletCard {
  /** Within its opening window right now, in the branch's own timezone. */
  isOpen: boolean
  /** Today's closing time while open, e.g. `"9:40 PM"`. Null while closed. */
  closesAt: string | null
  /** When it opens next, while closed. Null while open or when unknown. */
  nextOpenLabel: string | null
  /** Map link, or null when the branch can be neither located nor addressed. */
  directionsUrl: string | null
}

export interface DirectionsSource {
  latitude?: number | null
  longitude?: number | null
  address?: string | null
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * A Google Maps directions link, or null when there is nothing to point at.
 *
 * Coordinates win over the written address: an address string is a merchant's
 * free text and may be ambiguous or misspelled, while a coordinate pair is
 * exactly the point they pinned on the map. A half-filled pair is ignored
 * entirely rather than guessed at.
 *
 * The output is always an absolute https URL built from a fixed origin, so a
 * merchant cannot inject a `javascript:` or `data:` href through the address
 * field — the untrusted text only ever reaches the query string, encoded.
 */
export function outletDirectionsUrl(source: DirectionsSource): string | null {
  const { latitude, longitude, address } = source

  if (isFiniteNumber(latitude) && isFiniteNumber(longitude)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`
  }

  const trimmed = address?.trim()
  if (!trimmed) return null

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(trimmed)}`
}

/**
 * Read the branch's hours as a label, not as a policy.
 *
 * `getStoreOpenStatus` is asked with enforcement forced on because the two
 * questions differ: whether ordering is *blocked* is the tenant's
 * `enforce_operating_hours` decision, while the card only reports whether the
 * doors are open. A merchant who publishes hours but does not enforce them
 * still wants the card to say "Closes 9:40 PM".
 */
export function buildOutletCard(source: OutletCardSource, now: Date): OutletCard {
  const status = getStoreOpenStatus(
    {
      operating_hours: source.operating_hours,
      timezone: source.timezone,
      enforce_operating_hours: true,
    },
    now
  )

  return {
    isOpen: status.isOpen,
    closesAt: status.closesAt,
    nextOpenLabel: status.nextOpenLabel,
    directionsUrl: outletDirectionsUrl(source),
  }
}

/**
 * Narrow a branch list by the customer's search text.
 *
 * Address is searchable as well as name because a customer usually knows where
 * they are, not what the merchant named the branch. A query that matches
 * nothing returns nothing — falling back to the full list would silently
 * contradict the search box the customer just typed into.
 */
export function filterOutletsByQuery<T extends { name: string; address?: string | null }>(
  outlets: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...outlets]

  return outlets.filter((outlet) => {
    const haystack = `${outlet.name} ${outlet.address ?? ''}`.toLowerCase()
    return haystack.includes(needle)
  })
}
