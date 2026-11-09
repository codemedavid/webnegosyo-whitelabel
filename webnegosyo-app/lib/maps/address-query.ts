/**
 * What a customer types is not what a map can search.
 *
 * Philippine addresses carry the door and the directions in the same line as
 * the place ("Blk 4 Lot 12 Phase 2 Camella Homes Tanza", "likod ng Paniqui
 * Public Market"). Maps know the subdivision and the market, not the lot, and
 * those extra words send a search to the wrong town: in the 2026-11-06 test
 * Apple found 11 of 16 such addresses as typed and 15 of 16 once cleaned.
 *
 * Search also answers with entries other people added ("Blk 4 Lot 20 Camella
 * Homes…"). They look exact and are someone else's house, so they rank last
 * and never lend their lot number to the address the rider reads.
 *
 * Mirror of the web's src/lib/maps/address-query.ts: the app cannot import
 * from src/. tests/unit/maps/address-query-mirror.test.ts fails when they drift.
 */

const DOOR_PATTERNS: readonly RegExp[] = [
  /\b(?:blk|block|bl)\.?\s*#?\s*\d+[a-z]?\b/gi,
  /\b(?:lot|lt)\.?\s*#?\s*\d+[a-z]?\b/gi,
  /\b(?:phase|ph)\.?\s*#?\s*\d+[a-z]?\b/gi,
  /\b(?:unit|rm|room|flr|floor|tower|bldg|building)\.?\s*#?\s*(?:\d+[a-z]?|[a-z]\d*)\b/gi,
  /\b(?:purok|prk|sitio|zone)\.?\s+[^\s,]+/gi,
  // A house number starts the address or a comma's part. No lookbehind: older iPhones' Safari refuses to parse one.
  /(?:^|,\s*)\d+[a-z]?(?=\s)/gi,
  /#\s*\d+[a-z]?\b/gi,
]

const DIRECTION_WORDS = String.raw`sa tapat ng|sa likod ng|sa harap ng|tapat ng|likod ng|harap ng|katabi ng|malapit sa|in front of|infront of|front of|across|beside|near`
const LEADING_DIRECTION = new RegExp(String.raw`^\s*(${DIRECTION_WORDS})\s+`, 'i')
const TRAILING_DIRECTION = new RegExp(String.raw`[\s,]+((?:${DIRECTION_WORDS})\s.*)$`, 'i')

const DOOR_SHAPED_LABEL = /^\s*(?:#\s*\d|(?:blk|block|bl|lot|lt|phase|unit|bldg)\.?\s*#?\s*\d)|\b(?:blk|block|bl)\.?\s*#?\s*\d+.*\b(?:lot|lt)\.?\s*#?\s*\d+/i
const LEADING_HOUSE_NUMBER = /^\s*#?\d+[a-z]?(?:\s*[-–]\s*\d+[a-z]?)?\s+/i
const COUNTRY_SUFFIX = /,\s*Philippines\s*$/i
const POSTAL_CODE = /\b\d{4}\s+/g

/** Below this a cleaned query says nothing a map can use. */
const MIN_QUERY_LENGTH = 3
const MAX_SUGGESTIONS = 8

interface TypedAddress {
  /** The words a map can search. */
  place: string
  /** "Blk 4 Lot 12", "#18": the door, in the customer's own words. */
  door: string
  /** "near chapel", "tapat ng sari sari store". */
  trailingDirection: string
  /** "likod ng", when the words start with the direction. */
  leadingDirection: string
}

function tidy(text: string): string {
  return text
    .replace(/\s*,\s*(?:,\s*)*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
}

function splitTypedAddress(typed: string): TypedAddress {
  const leading = typed.match(LEADING_DIRECTION)
  const withoutLeading = leading ? typed.slice(leading[0].length) : typed
  const trailing = withoutLeading.match(TRAILING_DIRECTION)
  const withoutDirections = trailing ? withoutLeading.slice(0, trailing.index) : withoutLeading

  const doorParts: string[] = []
  let place = withoutDirections
  for (const pattern of DOOR_PATTERNS) {
    place = place.replace(pattern, (match) => {
      doorParts.push(match.replace(/^,?\s*/, '').trim())
      return match.startsWith(',') ? ', ' : ' '
    })
  }

  // Put the door back in the order it was typed: "Blk 4 Lot 12", never "Lot 12 Blk 4".
  const door = doorParts
    .map((part) => ({ part, at: withoutDirections.indexOf(part) }))
    .sort((a, b) => a.at - b.at)
    .map(({ part }) => part)
    .join(' ')

  return {
    place: tidy(place),
    door,
    trailingDirection: trailing ? trailing[1].trim() : '',
    leadingDirection: leading ? leading[1].trim() : '',
  }
}

/** The part of a typed address a map can search. */
export function cleanAddressQuery(typed: string): string {
  return splitTypedAddress(typed).place
}

/** What to search for: the cleaned words first (they find the right town), then the words as typed. */
export function searchQueriesFor(typed: string): string[] {
  const raw = typed.trim()
  if (!raw) return []
  const cleaned = cleanAddressQuery(raw)
  if (cleaned.length < MIN_QUERY_LENGTH || cleaned.toLowerCase() === raw.toLowerCase()) return [raw]
  return [cleaned, raw]
}

/** A result that names one lot or unit: most likely another customer's entry, not a place. */
export function isDoorShapedLabel(label: string): boolean {
  return DOOR_SHAPED_LABEL.test(label)
}

/** Several searches' answers as one list: no repeats, door-shaped entries last. */
export function mergeSuggestions<T extends { label: string }>(lists: ReadonlyArray<ReadonlyArray<T>>): T[] {
  const seen = new Set<string>()
  const unique = lists.flat().filter((entry) => {
    const key = entry.label.toLowerCase().replace(/\s+/g, ' ').trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return [
    ...unique.filter((entry) => !isDoorShapedLabel(entry.label)),
    ...unique.filter((entry) => isDoorShapedLabel(entry.label)),
  ].slice(0, MAX_SUGGESTIONS)
}

/** A place's address without a lot or house number that belongs to someone else. */
function withoutSomeoneElsesDoor(label: string): string {
  if (!isDoorShapedLabel(label)) return label
  return splitTypedAddress(label).place || label
}

/**
 * The address the rider reads after a customer picks a search result: their own
 * door and directions, on the picked place. A pick must never replace
 * "Blk 4 Lot 12" with the "Blk 4 Lot 20" of a near match.
 */
export function addressAfterPick(typed: string, label: string): string {
  const { door, leadingDirection, trailingDirection } = splitTypedAddress(typed)
  const place = withoutSomeoneElsesDoor(label)
  const onPlace = leadingDirection ? `${leadingDirection} ${place}` : place
  return [door, onPlace, trailingDirection].filter(Boolean).join(', ')
}

/** A reverse-geocoded address without the house number: maps guess the nearest one, and it is rarely the customer's. */
export function withoutHouseNumber(address: string): string {
  return address.replace(LEADING_HOUSE_NUMBER, '')
}

/** The short line under the pin: where this is, never claiming a door. */
export function nearLabel(address: string): string {
  return withoutHouseNumber(address).replace(COUNTRY_SUFFIX, '').replace(POSTAL_CODE, '').trim()
}
