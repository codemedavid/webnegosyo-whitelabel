// Rider remarks for a Lalamove booking — mirror of the web's
// src/lib/delivery/delivery-details.ts + src/lib/delivery/rider-remarks.ts.
// The deployment bundle cannot import from src/, so the rule lives twice;
// change both (tests/unit/delivery/rider-remarks.test.ts runs both).
//
// Lalamove sends the rider to the coordinates; the unit, landmark and note are
// what find the house. Capped at Lalamove's 1,500 characters, cutting the
// address text first and never the pin link.

const DELIVERY_ADDRESS_FIELD_NAME = 'delivery_address'

export const DELIVERY_UNIT_KEY = 'delivery_unit'
export const DELIVERY_LANDMARK_KEY = 'delivery_landmark'
export const DELIVERY_RIDER_NOTE_KEY = 'delivery_rider_note'

export interface DeliveryDetails {
  unit: string
  landmark: string
  riderNote: string
}

type DetailKind = keyof DeliveryDetails

const BUILT_IN_KEYS: Record<DetailKind, string> = {
  unit: DELIVERY_UNIT_KEY,
  landmark: DELIVERY_LANDMARK_KEY,
  riderNote: DELIVERY_RIDER_NOTE_KEY,
}

/** Keys that are never a detail answer, whatever their words say. */
const NEVER_DETAIL_KEYS = new Set([
  'delivery_address',
  'delivery_lat',
  'delivery_lng',
  'delivery_pin_address',
  'delivery_pin_confirmed',
  'outlet_id',
  'outlet_name',
])

const LANDMARK_WORDS = new Set(['landmark', 'landmarks', 'palatandaan', 'nearest', 'near'])
const UNIT_WORDS = new Set([
  'unit', 'floor', 'flr', 'bldg', 'building', 'room', 'rm', 'apartment', 'apt',
  'condo', 'tower', 'suite', 'blk', 'block', 'lot', 'house',
])
/** A question naming the rider (or the way there) is for the rider on its own. */
const RIDER_WORDS = new Set([
  'rider', 'riders', 'driver', 'drivers', 'drayber', 'courier', 'tagahatid',
  'direction', 'directions',
])
/** "Delivery" alone is a time or a date; with a note word it is a note for the trip. */
const DELIVERY_WORDS = new Set(['delivery', 'deliver', 'hatid', 'pagdeliver'])
/** A bare "Notes" is the store's general question, never the rider's. */
const NOTE_WORDS = new Set([
  'note', 'notes', 'remark', 'remarks', 'instruction', 'instructions',
  'paalala', 'bilin', 'mensahe', 'message',
])
/** A note about the FOOD is for the kitchen, not the rider. */
const KITCHEN_WORDS = new Set(['kitchen', 'food', 'order', 'item', 'items', 'allergy', 'allergies', 'special'])
/** Run-together labels ("nearestlandmark") have no word breaks to split on. */
const LANDMARK_FRAGMENTS = ['landmark', 'palatandaan']
const RIDER_FRAGMENTS = ['rider', 'driver', 'courier', 'deliverynote', 'deliveryinstruction', 'deliveryremark']

function labelWords(key: string): string[] {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function hasAny(words: string[], set: Set<string>): boolean {
  return words.some((word) => set.has(word))
}

function hasFragment(key: string, fragments: string[]): boolean {
  const joined = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return fragments.some((fragment) => joined.includes(fragment))
}

function isRiderNoteLabel(key: string, words: string[]): boolean {
  if (hasAny(words, RIDER_WORDS) || hasFragment(key, RIDER_FRAGMENTS)) return true
  return hasAny(words, DELIVERY_WORDS) && hasAny(words, NOTE_WORDS)
}

/** Which detail a merchant-named question holds, or null. */
export function classifyDetailKey(key: string): DetailKind | null {
  if (NEVER_DETAIL_KEYS.has(key)) return null
  const words = labelWords(key)
  if (words.includes('address')) return null
  if (hasAny(words, LANDMARK_WORDS) || hasFragment(key, LANDMARK_FRAGMENTS)) return 'landmark'
  if (hasAny(words, UNIT_WORDS)) return 'unit'
  if (hasAny(words, KITCHEN_WORDS)) return null
  if (isRiderNoteLabel(key, words)) return 'riderNote'
  return null
}

function answer(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The unit, landmark and rider note on an order; '' where none was given. */
export function findDeliveryDetails(customerData: Record<string, unknown> | null | undefined): DeliveryDetails {
  const data = customerData ?? {}
  const found: DeliveryDetails = { unit: '', landmark: '', riderNote: '' }
  for (const kind of Object.keys(BUILT_IN_KEYS) as DetailKind[]) {
    found[kind] = answer(data[BUILT_IN_KEYS[kind]])
  }
  for (const [key, value] of Object.entries(data)) {
    if (Object.values(BUILT_IN_KEYS).includes(key)) continue
    const kind = classifyDetailKey(key)
    const text = answer(value)
    if (kind && text && !found[kind]) found[kind] = text
  }
  return found
}

/** Whether the store's own form already asks for this detail (so the built-in field can stay hidden). */
export function formAsksFor(kind: DetailKind, fieldNames: readonly string[]): boolean {
  return fieldNames.some((name) => name !== BUILT_IN_KEYS[kind] && classifyDetailKey(name) === kind)
}


export const RIDER_REMARKS_MAX_LENGTH = 1500
const ELLIPSIS = '…'
/** A line cut shorter than this says nothing useful and is dropped. */
const MIN_USEFUL_LINE_LENGTH = 16

interface RemarkLine {
  order: number
  text: string
}

function parseCoordinate(value: unknown, limit: number): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : null
}

/** A Google Maps link to an exact pin — riders mostly navigate with it. */
export function pinLink(lat: unknown, lng: unknown): string | null {
  const latitude = parseCoordinate(lat, 90)
  const longitude = parseCoordinate(lng, 180)
  if (latitude === null || longitude === null) return null
  if (latitude === 0 && longitude === 0) return null
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
}

function fit(text: string, budget: number): string {
  if (text.length <= budget) return text
  if (budget < MIN_USEFUL_LINE_LENGTH) return ''
  return `${text.slice(0, budget - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`
}

export function buildRiderRemarks(
  customerData: Record<string, unknown> | null | undefined,
  addressFieldName: string = DELIVERY_ADDRESS_FIELD_NAME,
): string {
  const data = customerData ?? {}
  const details = findDeliveryDetails(data)
  const address = typeof data[addressFieldName] === 'string' ? (data[addressFieldName] as string).trim() : ''
  const link = pinLink(data.delivery_lat, data.delivery_lng)

  // Listed by priority (what survives a cut); `order` is where it prints.
  const candidates: RemarkLine[] = [
    { order: 5, text: link ? `Pin: ${link}` : '' },
    { order: 2, text: details.landmark ? `Landmark: ${details.landmark}` : '' },
    { order: 1, text: details.unit ? `Unit/Floor: ${details.unit}` : '' },
    { order: 3, text: details.riderNote ? `Note: ${details.riderNote}` : '' },
    { order: 4, text: address ? `Address: ${address}` : '' },
  ].filter((line) => line.text)

  let remaining = RIDER_REMARKS_MAX_LENGTH
  const kept: RemarkLine[] = []
  for (const line of candidates) {
    const separator = kept.length > 0 ? 1 : 0
    const text = fit(line.text, remaining - separator)
    if (!text) continue
    kept.push({ order: line.order, text })
    remaining -= text.length + separator
  }

  return kept
    .sort((a, b) => a.order - b.order)
    .map((line) => line.text)
    .join('\n')
}
