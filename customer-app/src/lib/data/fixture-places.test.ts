import { appPlacesResultSchema } from '@/lib/contract'
import { searchDemoPlaces } from './fixture-places'

describe('searchDemoPlaces (demo)', () => {
  it('finds places whose name or address hold every word, in the contract shape', () => {
    const places = searchDemoPlaces('makati legazpi')
    expect(places.map((place) => place.name)).toEqual(['Greenbelt 5'])
    expect(appPlacesResultSchema.safeParse({ places: searchDemoPlaces('a') }).success).toBe(true)
  })

  it('finds nothing for an unknown street', () => {
    expect(searchDemoPlaces('zzz nowhere')).toEqual([])
  })
})
