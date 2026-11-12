import type { AppOutlet } from '@/lib/contract'
import { branchOptions, defaultOutlet, outletAvailability } from './availability'

const outlet = (overrides: Partial<AppOutlet> = {}): AppOutlet => ({
  id: 'o1',
  name: 'BGC',
  address: null,
  imageUrl: null,
  latitude: null,
  longitude: null,
  supportsPickup: true,
  supportsDelivery: true,
  supportsDineIn: true,
  ...overrides,
})

describe('outletAvailability', () => {
  it('is open for a mode the branch supports', () => {
    expect(outletAvailability(outlet(), 'delivery')).toEqual({ isAvailable: true, reason: null })
  })

  it.each([
    ['pickup', { supportsPickup: false }, 'No pick up at this branch'],
    ['delivery', { supportsDelivery: false }, 'Doesn’t deliver'],
    ['dineIn', { supportsDineIn: false }, 'No dine in at this branch'],
  ] as const)('explains why %s is unavailable', (mode, overrides, reason) => {
    expect(outletAvailability(outlet(overrides), mode)).toEqual({ isAvailable: false, reason })
  })
})

describe('branchOptions', () => {
  it('lists open branches first, keeps menu order otherwise, and marks the selected one', () => {
    const outlets = [
      outlet({ id: 'a', supportsDelivery: false }),
      outlet({ id: 'b' }),
      outlet({ id: 'c' }),
    ]
    const options = branchOptions(outlets, 'delivery', 'c')
    expect(options.map((option) => option.outlet.id)).toEqual(['b', 'c', 'a'])
    expect(options.map((option) => option.isSelected)).toEqual([false, true, false])
    expect(options[2]).toMatchObject({ isAvailable: false, reason: 'Doesn’t deliver' })
  })

  it('does not mutate the catalog list', () => {
    const outlets = [outlet({ id: 'a', supportsPickup: false }), outlet({ id: 'b' })]
    branchOptions(outlets, 'pickup', null)
    expect(outlets.map((candidate) => candidate.id)).toEqual(['a', 'b'])
  })
})

describe('defaultOutlet', () => {
  it('starts on the first branch that serves the chosen mode', () => {
    const outlets = [outlet({ id: 'a', supportsDelivery: false }), outlet({ id: 'b' })]
    expect(defaultOutlet(outlets, 'delivery')?.id).toBe('b')
  })

  it('falls back to the first branch when none serves the mode, and to nothing without branches', () => {
    const outlets = [outlet({ id: 'a', supportsDelivery: false })]
    expect(defaultOutlet(outlets, 'delivery')?.id).toBe('a')
    expect(defaultOutlet([], 'pickup')).toBeUndefined()
  })
})
