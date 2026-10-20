/**
 * The words that get a rider to the door: unit, landmark and a note.
 *
 * The confirm-pin address field stores them under fixed keys
 * (`delivery_unit`, `delivery_landmark`, `delivery_rider_note`). Many stores
 * already ask the same things with questions they named themselves
 * ("Nearest Landmark", "Note to Rider", "Floor / Unit"), so those are found by
 * the WORDS in their label. Word matching, not substring: "Community" must not
 * read as a unit field.
 *
 * Mirrored in convex-template/convex/lalamoveRemarks.ts — keep both in step
 * (tests/unit/delivery/rider-remarks.test.ts runs the same cases on both).
 */

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
const NOTE_WORDS = new Set([
  'note', 'notes', 'remark', 'remarks', 'rider', 'driver', 'instruction',
  'instructions', 'direction', 'directions',
])
/** A note about the FOOD is for the kitchen, not the rider. */
const KITCHEN_WORDS = new Set(['kitchen', 'food', 'order', 'item', 'items', 'allergy', 'allergies', 'special'])
/** Run-together labels ("nearestlandmark") have no word breaks to split on. */
const LANDMARK_FRAGMENTS = ['landmark', 'palatandaan']
const NOTE_FRAGMENTS = ['instruction', 'rider']

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

/** Which detail a merchant-named question holds, or null. */
export function classifyDetailKey(key: string): DetailKind | null {
  if (NEVER_DETAIL_KEYS.has(key)) return null
  const words = labelWords(key)
  if (words.includes('address')) return null
  if (hasAny(words, LANDMARK_WORDS) || hasFragment(key, LANDMARK_FRAGMENTS)) return 'landmark'
  if (hasAny(words, UNIT_WORDS)) return 'unit'
  if (hasAny(words, KITCHEN_WORDS)) return null
  if (hasAny(words, NOTE_WORDS) || hasFragment(key, NOTE_FRAGMENTS)) return 'riderNote'
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
