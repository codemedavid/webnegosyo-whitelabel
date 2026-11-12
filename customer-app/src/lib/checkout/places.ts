import { APP_PLACE_QUERY_MAX, APP_PLACE_QUERY_MIN, type AppPlace } from '@/lib/contract'

/** Wait this long after the last keystroke before searching, so typing doesn't spend the store's map quota. */
export const PLACE_SEARCH_DEBOUNCE_MS = 300

/** What to search for, or null while there is too little to search (spaces collapsed, capped at the route's limit). */
export function placeSearchQuery(typed: string): string | null {
  const query = typed.replace(/\s+/g, ' ').trim().slice(0, APP_PLACE_QUERY_MAX).trim()
  return query.length >= APP_PLACE_QUERY_MIN ? query : null
}

export type PlaceSearchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; places: AppPlace[] }
  | { kind: 'empty'; query: string }
  | { kind: 'error'; message: string }

interface PlaceSearchInput {
  /** `placeSearchQuery` of what is in the field right now. */
  query: string | null
  /** The query the results belong to (debounced); null = nothing searched yet. */
  settledQuery: string | null
  places: AppPlace[] | undefined
  isFetching: boolean
  error: string | null
}

/** What the results area shows. Results for an older query stay up while the newer one loads. */
export function placeSearchState(input: PlaceSearchInput): PlaceSearchState {
  if (input.query === null) return { kind: 'idle' }
  if (input.error && !input.isFetching) return { kind: 'error', message: input.error }
  const isCurrent = input.settledQuery === input.query && !input.isFetching
  if (input.places && input.places.length > 0) return { kind: 'results', places: input.places }
  if (!isCurrent || input.places === undefined) return { kind: 'loading' }
  return { kind: 'empty', query: input.query }
}

/** A row's two lines: the landmark (or the start of the street address) and the full address. */
export function placeRowLabel(place: AppPlace): { title: string; subtitle: string | null } {
  if (place.name) return { title: place.name, subtitle: place.address }
  const [first, ...rest] = place.address.split(',')
  const remainder = rest.join(',').trim()
  return { title: first.trim(), subtitle: remainder === '' ? null : remainder }
}
