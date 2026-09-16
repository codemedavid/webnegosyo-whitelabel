import { validateAddonQuantities } from '@/lib/inventory/selection-quantities'

describe('validateAddonQuantities', () => {
  it('accepts legacy selections and positive integer portions of selected add-ons', () => {
    expect(validateAddonQuantities(undefined, ['cheese'])).toBe(true)
    expect(validateAddonQuantities({ cheese: 3 }, ['cheese'])).toBe(true)
  })
  it.each([0, -1, 1.5, Infinity, NaN, 100, '3'])('rejects invalid portions %s', (quantity) => {
    expect(validateAddonQuantities({ cheese: quantity }, ['cheese'])).toBe(false)
  })
  it('rejects unknown option IDs, nonobjects, and prototype keys', () => {
    expect(validateAddonQuantities({ cheese: 3 }, [])).toBe(false)
    expect(validateAddonQuantities([], ['cheese'])).toBe(false)
    expect(validateAddonQuantities(JSON.parse('{"__proto__":3}'), ['__proto__'])).toBe(false)
  })
})
