import type { AppPlace } from '@/lib/contract'
import { placeRowLabel, placeSearchQuery, placeSearchState } from './places'

const place: AppPlace = { name: 'SM Aura', address: '26th St, Taguig', lat: 14.54, lng: 121.05 }

describe('placeSearchQuery', () => {
  it('waits for at least 3 characters', () => {
    expect(placeSearchQuery('')).toBeNull()
    expect(placeSearchQuery('  sm ')).toBeNull()
    expect(placeSearchQuery('sm a')).toBe('sm a')
  })

  it('collapses spaces and caps the length at the route limit', () => {
    expect(placeSearchQuery('  12   Rizal\nSt ')).toBe('12 Rizal St')
    expect(placeSearchQuery('a'.repeat(200))).toHaveLength(120)
  })
})

describe('placeSearchState', () => {
  const base = { query: 'sm aura', settledQuery: 'sm aura', places: [place], isFetching: false, error: null }

  it('is idle below the minimum, whatever came back before', () => {
    expect(placeSearchState({ ...base, query: null })).toEqual({ kind: 'idle' })
  })

  it('loads while the debounce has not settled or the search is in flight', () => {
    expect(placeSearchState({ ...base, settledQuery: null, places: undefined })).toEqual({ kind: 'loading' })
    expect(placeSearchState({ ...base, places: undefined, isFetching: true })).toEqual({ kind: 'loading' })
  })

  it('keeps the last results up while a newer query loads', () => {
    expect(placeSearchState({ ...base, query: 'sm aura p', isFetching: true })).toEqual({ kind: 'results', places: [place] })
  })

  it('says nothing matched only for the query that was actually searched', () => {
    expect(placeSearchState({ ...base, places: [] })).toEqual({ kind: 'empty', query: 'sm aura' })
    expect(placeSearchState({ ...base, query: 'sm aurx', places: [] })).toEqual({ kind: 'loading' })
  })

  it('shows the error once the search has stopped', () => {
    expect(placeSearchState({ ...base, places: undefined, error: 'Offline' })).toEqual({ kind: 'error', message: 'Offline' })
  })
})

describe('placeRowLabel', () => {
  it('leads with the landmark, else the first part of the address', () => {
    expect(placeRowLabel(place)).toEqual({ title: 'SM Aura', subtitle: '26th St, Taguig' })
    expect(placeRowLabel({ ...place, name: null, address: '12 Rizal St, Poblacion, Makati' })).toEqual({ title: '12 Rizal St', subtitle: 'Poblacion, Makati' })
    expect(placeRowLabel({ ...place, name: null, address: 'Makati' })).toEqual({ title: 'Makati', subtitle: null })
  })
})
