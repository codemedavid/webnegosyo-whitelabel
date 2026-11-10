/** @jest-environment node */
import {
  readSavedAddresses,
  savedAddressFromAnswers,
  withoutSavedAddress,
  withSavedAddress,
  writeSavedAddresses,
  type SavedAddress,
} from '@/lib/checkout/saved-addresses'

const home: SavedAddress = { address: 'Blk 4 Lot 12, Camella Tanza', lat: 14.39, lng: 120.85 }
const office: SavedAddress = { address: 'Ayala Avenue, Makati', lat: 14.55, lng: 121.02, unit: '5B' }

function memoryStorage(initial: string | null = null) {
  const values = new Map<string, string>(initial === null ? [] : [['wn-delivery-addresses:shop', initial]])
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('saved addresses', () => {
  it('round-trips through storage, per store', () => {
    const storage = memoryStorage()
    writeSavedAddresses(storage, 'shop', [home])
    expect(readSavedAddresses(storage, 'shop')).toEqual([home])
    expect(readSavedAddresses(storage, 'other')).toEqual([])
  })

  it('survives broken or tampered storage', () => {
    expect(readSavedAddresses(memoryStorage('not json'), 'shop')).toEqual([])
    expect(readSavedAddresses(memoryStorage('{"a":1}'), 'shop')).toEqual([])
    expect(readSavedAddresses(memoryStorage(JSON.stringify([home, { address: '', lat: 'x' }])), 'shop')).toEqual([home])
  })

  it('survives storage that throws', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(readSavedAddresses(throwing, 'shop')).toEqual([])
    expect(() => writeSavedAddresses(throwing, 'shop', [home])).not.toThrow()
    warn.mockRestore()
  })

  it('keeps the newest first, no repeats, three at most', () => {
    const third = { address: 'C', lat: 1, lng: 1 }
    const fourth = { address: 'D', lat: 2, lng: 2 }
    expect(withSavedAddress([home, office], home)).toEqual([home, office])
    expect(withSavedAddress([home, office, third], fourth)).toEqual([fourth, home, office])
  })

  it('forgets one', () => {
    expect(withoutSavedAddress([home, office], home)).toEqual([office])
  })

  it('saves only a pin the customer confirmed', () => {
    const answers = { delivery_address: 'Camella', delivery_lat: '14.39', delivery_lng: '120.85', delivery_unit: ' Blk 4 ' }
    expect(savedAddressFromAnswers(answers)).toBeNull()
    expect(savedAddressFromAnswers({ ...answers, delivery_pin_confirmed: 'true' })).toEqual({ address: 'Camella', lat: 14.39, lng: 120.85, unit: 'Blk 4' })
    expect(savedAddressFromAnswers({ delivery_pin_confirmed: 'true', delivery_address: 'x' })).toBeNull()
  })
})
