import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkMovementEntry, checkStockEntry, checkUnitCost } from '@/lib/inventory/entry-check'

const kg = { abbreviation: 'kg' }
const g = { abbreviation: 'g' }
const ml = { abbreviation: 'ml' }
const pc = { abbreviation: 'pc' }

describe('checkStockEntry', () => {
  test("Uncle Drei's 4000 kg delivery on a 1.717 kg shelf: a unit slip with the fix", () => {
    const doubt = checkStockEntry({ kind: 'receive', quantity: 4000, unit: kg, onHand: 1.717 })
    expect(doubt?.title).toBe('4,000 kg? That is 4 tonnes.')
    expect(doubt?.fix).toEqual({ label: 'Use 4 kg', quantity: 4 })
    expect(doubt?.confirmLabel).toBe('Yes, add 4,000 kg')
  })

  test('a count in kilograms that reads like grams is doubted too', () => {
    expect(checkStockEntry({ kind: 'stocktake', quantity: 5717, unit: kg, onHand: 5.7 })?.fix?.quantity).toBe(5.717)
  })

  test('ordinary deliveries and counts pass', () => {
    expect(checkStockEntry({ kind: 'receive', quantity: 25, unit: kg, onHand: 3 })).toBeNull()
    expect(checkStockEntry({ kind: 'receive', quantity: 20000, unit: g, onHand: 1500 })).toBeNull()
    expect(checkStockEntry({ kind: 'receive', quantity: 500, unit: pc, onHand: 0 })).toBeNull() // first box on an empty shelf
    expect(checkStockEntry({ kind: 'receive', quantity: 99, unit: pc, onHand: 0.5 })).toBeNull() // under the floor
    expect(checkStockEntry({ kind: 'stocktake', quantity: 0, unit: kg, onHand: 3 })).toBeNull()
    expect(checkStockEntry({ kind: 'receive', quantity: 999, unit: kg, onHand: 50 })).toBeNull()
  })

  test('a delivery 100x the shelf is doubted, without a guessed fix', () => {
    const doubt = checkStockEntry({ kind: 'receive', quantity: 2000, unit: g, onHand: 20 })
    expect(doubt?.title).toBe('2,000 g is 100× what is on the shelf.')
    expect(doubt?.fix).toBeNull()
  })

  test('waste is never doubted here (the overcounted-waste warning covers it)', () => {
    expect(checkStockEntry({ kind: 'waste', quantity: 4000, unit: kg, onHand: 2 })).toBeNull()
  })

  test('the key changes with what was typed, so a new figure needs a new confirmation', () => {
    const a = checkStockEntry({ kind: 'receive', quantity: 4000, unit: kg, onHand: 1 })
    const b = checkStockEntry({ kind: 'receive', quantity: 5000, unit: kg, onHand: 1 })
    expect(a?.key).not.toBe(b?.key)
  })
})

describe('checkUnitCost', () => {
  test("Sorpresso's P82 per gram of milk: the price of a litre", () => {
    const doubt = checkUnitCost(82, g)
    expect(doubt?.title).toBe('₱82 for ONE g?')
    expect(doubt?.message).toContain('1 kg cost ₱82,000')
    expect(doubt?.fix?.cost).toBeCloseTo(0.082)
  })

  test('ordinary prices pass', () => {
    expect(checkUnitCost(0.9, g)).toBeNull()
    expect(checkUnitCost(256, kg)).toBeNull()
    expect(checkUnitCost(0.23, ml)).toBeNull()
    expect(checkUnitCost(73, pc)).toBeNull()
    expect(checkUnitCost(0, g)).toBeNull()
  })

  test('a sack price per kilogram is doubted', () => {
    expect(checkUnitCost(25000, kg)?.title).toBe('₱25,000 for ONE kg?')
  })

  test('a delivery is checked for its quantity first, then its price', () => {
    expect(checkMovementEntry({ kind: 'receive', quantity: 4000, unit: kg, onHand: 1, unitCost: 1 })?.key).toMatch(/^slip:/)
    expect(checkMovementEntry({ kind: 'receive', quantity: 2, unit: g, onHand: 100, unitCost: 82 })?.key).toMatch(/^price-small:/)
    expect(checkMovementEntry({ kind: 'stocktake', quantity: 2, unit: g, onHand: 100, unitCost: 82 })).toBeNull()
  })
})

test("the merchant app's copy is the web's, byte for byte", () => {
  const web = readFileSync(join(process.cwd(), 'src/lib/inventory/entry-check.ts'), 'utf8')
  const app = readFileSync(join(process.cwd(), 'webnegosyo-app/lib/inventory-entry-check.ts'), 'utf8')
  expect(app).toBe(web)
})
