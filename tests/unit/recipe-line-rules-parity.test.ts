/**
 * The merchant app refuses an undeductible recipe line with
 * `webnegosyo-app/lib/recipe-line-rules.ts`; the web editor and the recipe
 * save route refuse it with `src/lib/inventory/recipe-line-rules.ts` (+ the
 * conversion rule in `unit-conversion.ts`). The app cannot import root `src/`,
 * so the rule is kept as two copies — and a line one copy accepts while the
 * other refuses is either saved and then silently skipped by every sale, or
 * blocked on one device and fine on the other.
 *
 * One fixture table goes through both copies; every verdict (the merchant
 * message included) must match.
 */

import {
  canConvertUnits as appCanConvertUnits,
  compatibleRecipeUnits as appCompatibleRecipeUnits,
  recipeLineProblem as appRecipeLineProblem,
  type RuleUnit,
} from '../../webnegosyo-app/lib/recipe-line-rules'
import {
  compatibleRecipeUnits as webCompatibleRecipeUnits,
  recipeLineProblem as webRecipeLineProblem,
} from '@/lib/inventory/recipe-line-rules'
import { canConvertUnits as webCanConvertUnits, type InventoryUnit } from '@/lib/inventory/unit-conversion'

const UNITS: readonly InventoryUnit[] = [
  { id: 'g', name: 'Gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 },
  { id: 'kg', name: 'Kilogram', abbreviation: 'kg', dimension: 'weight', to_base_factor: 1000 },
  { id: 'ml', name: 'Millilitre', abbreviation: 'ml', dimension: 'volume', to_base_factor: 1 },
  { id: 'l', name: 'Litre', abbreviation: 'L', dimension: 'volume', to_base_factor: 1000 },
  { id: 'pc', name: 'Piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 },
  { id: 'dz', name: 'Dozen', abbreviation: 'dz', dimension: 'count', to_base_factor: 12 },
]

const UNIT_IDS = UNITS.map((unit) => unit.id)

/** The app's unit shape is a subset of the web's; the same rows feed both. */
const APP_UNITS: readonly RuleUnit[] = UNITS

interface LineCase {
  label: string
  quantity: number
  unitId: string
  ingredientName: string
  /** `null` is what an ingredient row with no stock unit really carries. */
  stockUnitId: string | null
}

const QUANTITIES: readonly [string, number][] = [
  ['positive', 2],
  ['fractional', 0.25],
  ['zero', 0],
  ['negative', -1],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
]

/** Every unit pair (count/weight/volume, compatible and not) at a valid quantity. */
const UNIT_PAIR_CASES: LineCase[] = UNIT_IDS.flatMap((stockUnitId) =>
  UNIT_IDS.map((unitId) => ({
    label: `2 ${unitId} of an ingredient stocked in ${stockUnitId}`,
    quantity: 2,
    unitId,
    ingredientName: 'Flour',
    stockUnitId,
  })),
)

/** Every bad and good quantity, for a known and an unknown stock unit. */
const QUANTITY_CASES: LineCase[] = QUANTITIES.flatMap(([word, quantity]) =>
  ['g', 'missing-unit', null].map((stockUnitId) => ({
    label: `${word} quantity, stock unit ${String(stockUnitId)}`,
    quantity,
    unitId: 'g',
    ingredientName: 'Sugar',
    stockUnitId,
  })),
)

const EDGE_CASES: LineCase[] = [
  { label: 'line unit not in the catalogue', quantity: 1, unitId: 'ghost', ingredientName: 'Egg', stockUnitId: 'pc' },
  { label: 'line unit blank', quantity: 1, unitId: '', ingredientName: 'Egg', stockUnitId: 'pc' },
  { label: 'stock unit missing from the catalogue', quantity: 1, unitId: 'g', ingredientName: 'Egg', stockUnitId: 'ghost' },
  { label: 'null stock unit, unknown line unit', quantity: 1, unitId: 'ghost', ingredientName: 'Egg', stockUnitId: null },
  { label: 'blank stock unit', quantity: 1, unitId: 'g', ingredientName: 'Egg', stockUnitId: '' },
]

function appVerdict(line: LineCase): string | null {
  return appRecipeLineProblem(
    { quantity: line.quantity, unitId: line.unitId },
    { name: line.ingredientName, stockUnitId: line.stockUnitId },
    APP_UNITS,
  )
}

function webVerdict(line: LineCase): string | null {
  return webRecipeLineProblem(
    { quantity: line.quantity, unit_id: line.unitId },
    // The web type says string; a row with no stock unit really carries null.
    { name: line.ingredientName, stock_unit_id: line.stockUnitId as string },
    UNITS,
  )
}

describe('recipe line rules: app mirrors web', () => {
  it.each([...UNIT_PAIR_CASES, ...QUANTITY_CASES, ...EDGE_CASES].map((line) => [line.label, line] as const))(
    'recipeLineProblem agrees: %s',
    (_label, line) => {
      expect(appVerdict(line)).toBe(webVerdict(line))
    },
  )

  it.each(UNITS.flatMap((from) => UNITS.map((to) => [from.id, to.id, from, to] as const)))(
    'canConvertUnits agrees: %s → %s',
    (_from, _to, from, to) => {
      expect(appCanConvertUnits(from, to)).toBe(webCanConvertUnits(from, to))
    },
  )

  it.each([...UNIT_IDS, 'ghost', ''].map((stockUnitId) => [stockUnitId] as const))(
    'compatibleRecipeUnits agrees for stock unit "%s"',
    (stockUnitId) => {
      const app = appCompatibleRecipeUnits(stockUnitId, UNITS).map((unit) => unit.id)
      const web = webCompatibleRecipeUnits(stockUnitId, UNITS).map((unit) => unit.id)
      expect(app).toEqual(web)
    },
  )

  it('compatibleRecipeUnits agrees for an ingredient with no stock unit (null)', () => {
    const app = appCompatibleRecipeUnits(null, UNITS).map((unit) => unit.id)
    const web = webCompatibleRecipeUnits(null as unknown as string, UNITS).map((unit) => unit.id)
    expect(app).toEqual(web)
  })
})

describe('recipe line rules: edge cases that once disagreed', () => {
  it('a nameless ingredient is worded the same', () => {
    const line: LineCase = { label: 'nameless', quantity: 0, unitId: 'g', ingredientName: '', stockUnitId: 'g' }
    expect(appVerdict(line)).toBe(webVerdict(line))
  })

  it('a unit with no dimension converts the same (it does not)', () => {
    const undimensioned = { ...UNITS[0], id: 'x', abbreviation: 'x', dimension: undefined }
    const pieces = UNITS[4]
    expect(appCanConvertUnits(undimensioned, pieces)).toBe(
      webCanConvertUnits(undimensioned as unknown as InventoryUnit, pieces),
    )
    expect(appCanConvertUnits(undimensioned, pieces)).toBe(false)
  })
})
