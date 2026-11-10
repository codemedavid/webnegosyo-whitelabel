/**
 * A returning customer's delivery addresses, on their own device only.
 *
 * Pinning takes the longest the first time and should not take any time after
 * that. Nothing here leaves the browser, and a counter tablet never saves
 * (the caller checks kiosk mode). Storage can be missing or refuse a write in a
 * private window, so every touch is guarded and the checkout works without it.
 */

import { z } from 'zod'

export const MAX_SAVED_ADDRESSES = 3
/** Two pins this close (about 10m) on the same address are the same place. */
const SAME_PIN_DEGREES = 0.0001

const savedAddressSchema = z.object({
  address: z.string().trim().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  unit: z.string().max(200).optional(),
  landmark: z.string().max(200).optional(),
  riderNote: z.string().max(200).optional(),
})

export type SavedAddress = z.infer<typeof savedAddressSchema>

type ReadableStorage = Pick<Storage, 'getItem'>
type WritableStorage = Pick<Storage, 'setItem'>

function storageKey(tenantSlug: string): string {
  return `wn-delivery-addresses:${tenantSlug}`
}

export function readSavedAddresses(storage: ReadableStorage, tenantSlug: string): SavedAddress[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey(tenantSlug)) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => savedAddressSchema.safeParse(entry))
      .flatMap((result) => (result.success ? [result.data] : []))
      .slice(0, MAX_SAVED_ADDRESSES)
  } catch {
    return []
  }
}

function isSamePlace(a: SavedAddress, b: SavedAddress): boolean {
  return (
    a.address.trim().toLowerCase() === b.address.trim().toLowerCase() &&
    Math.abs(a.lat - b.lat) < SAME_PIN_DEGREES &&
    Math.abs(a.lng - b.lng) < SAME_PIN_DEGREES
  )
}

/** The list with `entry` first: newest on top, no repeats, three at most. */
export function withSavedAddress(list: readonly SavedAddress[], entry: SavedAddress): SavedAddress[] {
  return [entry, ...list.filter((saved) => !isSamePlace(saved, entry))].slice(0, MAX_SAVED_ADDRESSES)
}

export function withoutSavedAddress(list: readonly SavedAddress[], entry: SavedAddress): SavedAddress[] {
  return list.filter((saved) => !isSamePlace(saved, entry))
}

export function writeSavedAddresses(storage: WritableStorage, tenantSlug: string, list: readonly SavedAddress[]): void {
  try {
    storage.setItem(storageKey(tenantSlug), JSON.stringify(list))
  } catch (error) {
    // A full or blocked store only costs the next visit's shortcut.
    console.warn('[saved-addresses] could not save:', error)
  }
}

/** What an order's answers would save, or null when it has no confirmed pin. */
export function savedAddressFromAnswers(answers: Readonly<Record<string, string>>): SavedAddress | null {
  if (answers.delivery_pin_confirmed !== 'true') return null
  const parsed = savedAddressSchema.safeParse({
    address: answers.delivery_address,
    lat: Number(answers.delivery_lat),
    lng: Number(answers.delivery_lng),
    unit: answers.delivery_unit?.trim() || undefined,
    landmark: answers.delivery_landmark?.trim() || undefined,
    riderNote: answers.delivery_rider_note?.trim() || undefined,
  })
  return parsed.success ? parsed.data : null
}
