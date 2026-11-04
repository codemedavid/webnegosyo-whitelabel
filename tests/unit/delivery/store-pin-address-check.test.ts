/** @jest-environment node */
import { storePinAddressMismatchKm, STORE_PIN_ADDRESS_MISMATCH_KM } from '@/lib/delivery/store-pin-address-check'

const place = (lat: number, lng: number, isStreetLevel = true) => ({
  name: null, address: 'x', coordinates: { lat, lng }, countryCode: 'PH', towns: [], isStreetLevel,
})

describe('storePinAddressMismatchKm', () => {
  const pin = { lat: 14.6255, lng: 121.0672 }

  it('says nothing when the pin is near the typed address', () => {
    expect(storePinAddressMismatchKm(pin, [place(14.63, 121.07)])).toBeNull()
  })

  it('reports how far a pin is from a street-level match for the address', () => {
    const km = storePinAddressMismatchKm(pin, [place(10.31, 123.89)])
    expect(km).toBeGreaterThan(STORE_PIN_ADDRESS_MISMATCH_KM)
    expect(Math.round(km ?? 0)).toBeGreaterThan(500)
  })

  it('ignores town-level matches: "Lucena" says nothing about where the door is', () => {
    expect(storePinAddressMismatchKm(pin, [place(13.93, 121.61, false)])).toBeNull()
  })

  it('says nothing without a match or a pin', () => {
    expect(storePinAddressMismatchKm(pin, [])).toBeNull()
    expect(storePinAddressMismatchKm(null, [place(10.31, 123.89)])).toBeNull()
  })
})
