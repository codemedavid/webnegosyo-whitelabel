import {
  convertQuantity,
  toBaseQuantity,
  type InventoryUnit,
} from '@/lib/inventory/unit-conversion'

// Base units have to_base_factor = 1; others express how many base units they hold.
const gram: InventoryUnit = { id: 'g', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const kilogram: InventoryUnit = { id: 'kg', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 }
const milligram: InventoryUnit = { id: 'mg', name: 'Milligram', abbreviation: 'mg', dimension: 'weight', to_base_factor: 0.001 }
const milliliter: InventoryUnit = { id: 'ml', name: 'Milliliter', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1 }
const liter: InventoryUnit = { id: 'l', name: 'Liter', abbreviation: 'L', dimension: 'volume', to_base_factor: 1000 }
const piece: InventoryUnit = { id: 'pc', name: 'Piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }

describe('toBaseQuantity', () => {
  test('base unit is unchanged', () => {
    expect(toBaseQuantity(5, gram)).toBe(5)
  })

  test('scales up to the base unit', () => {
    expect(toBaseQuantity(2, kilogram)).toBe(2000)
  })

  test('scales down to the base unit', () => {
    expect(toBaseQuantity(500, milligram)).toBe(0.5)
  })
})

describe('convertQuantity', () => {
  test('identical unit returns the same quantity', () => {
    expect(convertQuantity(250, gram, gram)).toBe(250)
  })

  test('kilograms to grams', () => {
    expect(convertQuantity(2, kilogram, gram)).toBe(2000)
  })

  test('grams to kilograms', () => {
    expect(convertQuantity(500, gram, kilogram)).toBe(0.5)
  })

  test('milligrams to grams', () => {
    expect(convertQuantity(1500, milligram, gram)).toBe(1.5)
  })

  test('liters to milliliters', () => {
    expect(convertQuantity(1.25, liter, milliliter)).toBe(1250)
  })

  test('zero quantity converts to zero', () => {
    expect(convertQuantity(0, kilogram, gram)).toBe(0)
  })

  test('throws when converting across dimensions', () => {
    expect(() => convertQuantity(1, gram, milliliter)).toThrow(/dimension/i)
    expect(() => convertQuantity(1, piece, gram)).toThrow(/dimension/i)
  })

  test('throws on non-finite quantity', () => {
    expect(() => convertQuantity(NaN, gram, gram)).toThrow()
    expect(() => convertQuantity(Infinity, kilogram, gram)).toThrow()
  })

  test('round-trips without drift', () => {
    const grams = convertQuantity(3, kilogram, gram)
    expect(convertQuantity(grams, gram, kilogram)).toBeCloseTo(3, 10)
  })
})
