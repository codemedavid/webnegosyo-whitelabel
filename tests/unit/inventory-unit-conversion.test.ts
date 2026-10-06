import {
  canConvertUnits,
  convertQuantity,
  convertUnitCost,
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

  // Restocked in litres, used in grams: a café's syrups and milk are bought by
  // the litre and measured by the gram. Water density (1 g = 1 ml) bridges them.
  test('litres to grams bridges weight and volume at 1 g per ml', () => {
    expect(convertQuantity(2, liter, gram)).toBe(2000)
  })

  test('grams to litres bridges weight and volume at 1 g per ml', () => {
    expect(convertQuantity(45, gram, liter)).toBeCloseTo(0.045, 10)
  })

  test('kilograms to millilitres bridges weight and volume', () => {
    expect(convertQuantity(1.5, kilogram, milliliter)).toBe(1500)
  })

  test('throws when converting pieces to or from weight or volume', () => {
    expect(() => convertQuantity(1, piece, gram)).toThrow(/dimension/i)
    expect(() => convertQuantity(1, milliliter, piece)).toThrow(/dimension/i)
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

/**
 * A price is per-unit, so it scales the OPPOSITE way to a quantity: 2 kg is
 * 2000 g (bigger number), but ₱120/kg is ₱0.12/g (smaller number). Converting a
 * price with `convertQuantity` inverts the error rather than avoiding it, which
 * is why this is its own function and not a caller's one-liner.
 */
describe('convertUnitCost', () => {
  test('identical unit returns the same price', () => {
    expect(convertUnitCost(4.5, gram, gram)).toBe(4.5)
  })

  test('a price per kilogram becomes a smaller price per gram', () => {
    // The live defect: ₱120 per kg stored as ₱120 per gram, 1000x too high.
    expect(convertUnitCost(120, kilogram, gram)).toBeCloseTo(0.12, 10)
  })

  test('a price per gram becomes a larger price per kilogram', () => {
    expect(convertUnitCost(0.12, gram, kilogram)).toBeCloseTo(120, 10)
  })

  test('a price per liter becomes a price per milliliter', () => {
    expect(convertUnitCost(85, liter, milliliter)).toBeCloseTo(0.085, 10)
  })

  test('a free item stays free', () => {
    expect(convertUnitCost(0, kilogram, gram)).toBe(0)
  })

  test('round-trips without drift', () => {
    const perGram = convertUnitCost(120, kilogram, gram)
    expect(convertUnitCost(perGram, gram, kilogram)).toBeCloseTo(120, 10)
  })

  test('a price per litre becomes a price per gram at 1 g per ml', () => {
    expect(convertUnitCost(300, liter, gram)).toBeCloseTo(0.3, 10)
  })

  test('throws when converting a price to or from pieces', () => {
    expect(() => convertUnitCost(1, piece, gram)).toThrow(/dimension/i)
    expect(() => convertUnitCost(1, milliliter, piece)).toThrow(/dimension/i)
  })

  test('preserves total value across the weight/volume bridge', () => {
    const quantityInStockUnit = convertQuantity(2, liter, gram)
    const costInStockUnit = convertUnitCost(150, liter, gram)
    expect(quantityInStockUnit * costInStockUnit).toBeCloseTo(300, 8)
  })

  test('throws on a non-finite price', () => {
    expect(() => convertUnitCost(NaN, kilogram, gram)).toThrow()
    expect(() => convertUnitCost(Infinity, kilogram, gram)).toThrow()
  })

  test('is the inverse of convertQuantity, so total value is preserved', () => {
    // 2 kg at ₱120/kg is ₱240 of stock however the shelf chooses to measure it.
    const quantityInStockUnit = convertQuantity(2, kilogram, gram)
    const costInStockUnit = convertUnitCost(120, kilogram, gram)
    expect(quantityInStockUnit * costInStockUnit).toBeCloseTo(240, 8)
  })
})

describe('canConvertUnits', () => {
  test('same dimension converts', () => {
    expect(canConvertUnits(kilogram, gram)).toBe(true)
  })

  test('weight and volume convert both ways', () => {
    expect(canConvertUnits(gram, liter)).toBe(true)
    expect(canConvertUnits(milliliter, kilogram)).toBe(true)
  })

  test('pieces convert only to pieces', () => {
    expect(canConvertUnits(piece, piece)).toBe(true)
    expect(canConvertUnits(piece, gram)).toBe(false)
    expect(canConvertUnits(milliliter, piece)).toBe(false)
  })
})
