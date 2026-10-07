/** Display helpers for the superadmin Client Map. Pure. */

import type { MapsProvider } from '@/lib/maps/provider'

const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_PER_MONTH = 30.44
const MONTHS_PER_YEAR = 12
const COUNTRY = /^philippines$/i
const POSTAL_CODE = /^\d{4}$/

/**
 * Logo diameter on the Apple map by camera altitude, matching the Mapbox map's
 * zoom 7 / zoom 11 steps: small over the whole country, full size on the street.
 */
const CAMERA_PIN_SIZES: ReadonlyArray<readonly [minDistanceM: number, sizePx: number]> = [
  [300_000, 30],
  [20_000, 38],
]
const CLOSE_UP_PIN_PX = 46
const FAR_PIN_PX = CAMERA_PIN_SIZES[0][1]

interface MapsLinkTarget {
  name: string
  lat: number
  lng: number
}

export interface ExternalMapsLink {
  href: string
  label: string
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/** "Balayan, Batangas" from a full typed address — the last two meaningful parts. */
export function shortLocality(address: string | null): string | null {
  if (!address) return null
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !COUNTRY.test(part) && !POSTAL_CODE.test(part))
    .filter((part, index, all) => index === 0 || part.toLowerCase() !== all[index - 1].toLowerCase())
  if (parts.length === 0) return null
  return parts.slice(-2).join(', ')
}

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
  return initials || '?'
}

/** How long a store has been a client: "4 days", "3 months", "2 years". */
export function formatClientTenure(createdAt: string, now: Date): string | null {
  const created = Date.parse(createdAt)
  if (!Number.isFinite(created)) return null

  const days = Math.floor((now.getTime() - created) / DAY_MS)
  if (days < 1) return 'Joined today'
  const months = Math.floor(days / DAYS_PER_MONTH)
  if (months < 1) return plural(days, 'day')
  if (months < MONTHS_PER_YEAR) return plural(months, 'month')
  return plural(Math.floor(months / MONTHS_PER_YEAR), 'year')
}

export function pinSizeForCameraDistance(distanceM: number): number {
  if (!Number.isFinite(distanceM)) return FAR_PIN_PX
  return CAMERA_PIN_SIZES.find(([minDistanceM]) => distanceM >= minDistanceM)?.[1] ?? CLOSE_UP_PIN_PX
}

/** Apple Maps search for the store, dropped at its pin. */
export function appleMapsUrl({ name, lat, lng }: MapsLinkTarget): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(name)}&ll=${lat},${lng}`
}

/** "Open in …" link that matches the map the page is drawn with. */
export function externalMapsLink(target: MapsLinkTarget, provider: MapsProvider): ExternalMapsLink {
  if (provider === 'apple') return { href: appleMapsUrl(target), label: 'Open in Apple Maps' }
  return {
    href: `https://www.google.com/maps/search/?api=1&query=${target.lat},${target.lng}`,
    label: 'Open in Google Maps',
  }
}
