/** @jest-environment node */
import { orderMapLink } from '@/lib/delivery/order-map-link'

describe('orderMapLink', () => {
  it('links to the exact pin when the order has one', () => {
    expect(orderMapLink({ delivery_lat: '14.5861', delivery_lng: '121.1761', delivery_address: 'Mabini St' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=14.5861,121.1761',
    )
  })

  it('falls back to searching the address text when there is no pin', () => {
    expect(orderMapLink({ delivery_address: '12 Mabini St, Antipolo' })).toBe(
      'https://www.google.com/maps/search/?api=1&query=12%20Mabini%20St%2C%20Antipolo',
    )
    expect(orderMapLink({}, 'Purok 3, Lucena')).toBe('https://www.google.com/maps/search/?api=1&query=Purok%203%2C%20Lucena')
  })

  it('returns null with neither a pin nor an address', () => {
    expect(orderMapLink({ delivery_lat: 'x' })).toBeNull()
    expect(orderMapLink(null)).toBeNull()
  })
})
