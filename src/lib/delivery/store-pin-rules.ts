/**
 * What a store's (or branch's) pickup pin must satisfy before it is saved.
 *
 * The 2026-10 audit found Lalamove stores with no pickup pin, one pinned
 * ~550 km from its own address, and new stores defaulting to the Hong Kong
 * market. A missing or foreign pin cannot be quoted at all, so the save is
 * refused with a message the owner can act on:
 *
 * - both halves or neither (half a pin is a broken save, never a choice);
 * - inside the Philippines for a PH store — an unset market counts as PH,
 *   because every store on the platform trades there;
 * - required when Lalamove or distance pricing is on, since riders pick up
 *   at the pin and fees are measured from it.
 */

import { isInsidePhilippines } from '@/lib/delivery/pin-assessment'

export const LALAMOVE_MARKETS = [
  { code: 'PH', label: 'Philippines' },
  { code: 'SG', label: 'Singapore' },
  { code: 'HK', label: 'Hong Kong' },
  { code: 'TH', label: 'Thailand' },
  { code: 'TW', label: 'Taiwan' },
  { code: 'MY', label: 'Malaysia' },
  { code: 'VN', label: 'Vietnam' },
] as const

export const DEFAULT_LALAMOVE_MARKET = 'PH'

export const STORE_PIN_MESSAGES = {
  incomplete: 'The store pin is incomplete. Pick the address again so the map sets the pin.',
  required: "Pin your store's location on the map. Riders pick up orders there and delivery fees are measured from it.",
  branchRequired: "Pin this branch's location on the map. Riders pick up its delivery orders there.",
  outsidePhilippines: "The pin is outside the Philippines. Move it to your store's entrance.",
} as const

export interface StorePinInput {
  lat: number | null | undefined
  lng: number | null | undefined
  market?: string | null
  isPinRequired: boolean
  subject?: 'store' | 'branch'
}

export interface StorePinRequirementFields {
  lalamove_enabled?: boolean | null
  distance_delivery_enabled?: boolean | null
}

function isSet(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPhilippineMarket(market: string | null | undefined): boolean {
  const code = (market ?? '').trim().toUpperCase()
  return code === '' || code === DEFAULT_LALAMOVE_MARKET
}

export function isStorePinRequired(store: StorePinRequirementFields): boolean {
  return store.lalamove_enabled === true || store.distance_delivery_enabled === true
}

/** A message to show the owner, or null when the pin may be saved. */
export function validateStorePin({ lat, lng, market, isPinRequired, subject = 'store' }: StorePinInput): string | null {
  const hasLat = isSet(lat)
  const hasLng = isSet(lng)
  if (hasLat !== hasLng) return STORE_PIN_MESSAGES.incomplete
  if (!hasLat || !hasLng) {
    if (!isPinRequired) return null
    return subject === 'branch' ? STORE_PIN_MESSAGES.branchRequired : STORE_PIN_MESSAGES.required
  }
  if (isPhilippineMarket(market) && !isInsidePhilippines({ lat, lng })) return STORE_PIN_MESSAGES.outsidePhilippines
  return null
}
