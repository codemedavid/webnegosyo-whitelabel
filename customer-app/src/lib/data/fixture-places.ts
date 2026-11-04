import type { AppPlace } from '@/lib/contract'
import { APP_PLACES_MAX } from '@/lib/contract'

/** Prototype only: places the demo's address search can find (around the demo branches). */
const DEMO_PLACES: readonly AppPlace[] = [
  { id: 'pl-1', name: 'Bonifacio High Street', address: '9th Ave cor. 28th St, Taguig', lat: 14.5509, lng: 121.0503 },
  { id: 'pl-2', name: 'SM Aura Premier', address: '26th St cor. McKinley Pkwy, Taguig', lat: 14.5466, lng: 121.0546 },
  { id: 'pl-3', name: 'Uptown Mall', address: '36th St cor. 9th Ave, Taguig', lat: 14.5566, lng: 121.0546 },
  { id: 'pl-4', name: null, address: '12 Rizal St, Poblacion, Makati', lat: 14.5649, lng: 121.0317 },
  { id: 'pl-5', name: 'Salcedo Saturday Market', address: 'Jaime Velasquez Park, Salcedo Village, Makati', lat: 14.5606, lng: 121.0237 },
  { id: 'pl-6', name: 'Greenbelt 5', address: 'Legazpi St, Legazpi Village, Makati', lat: 14.5523, lng: 121.0213 },
  { id: 'pl-7', name: 'Ayala Triangle Gardens', address: 'Paseo de Roxas, Makati', lat: 14.5571, lng: 121.0244 },
  { id: 'pl-8', name: null, address: '45 Kalayaan Ave, Diliman, Quezon City', lat: 14.6507, lng: 121.0494 },
  { id: 'pl-9', name: 'SM North EDSA', address: 'North Ave cor. EDSA, Quezon City', lat: 14.6566, lng: 121.0294 },
  { id: 'pl-10', name: 'Rockwell Power Plant Mall', address: 'Amorsolo Dr, Makati', lat: 14.5649, lng: 121.0366 },
]

/** Every typed word must appear in the place's name or address, like a real type-ahead. */
export function searchDemoPlaces(query: string): AppPlace[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return DEMO_PLACES.filter((place) => {
    const haystack = `${place.name ?? ''} ${place.address}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  }).slice(0, APP_PLACES_MAX)
}
