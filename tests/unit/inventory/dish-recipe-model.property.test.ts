/**
 * The dish recipe table must never change what a sale deducts, except where
 * the owner typed a new amount. Checked against the REAL depletion engine
 * (`resolveOrderDepletions`), over every selection a customer can make.
 */
import fc from 'fast-check'
import { resolveOrderDepletions } from '@/lib/inventory/order-depletion'
import {
  setByGroup,
  setRowAmount,
  toDraft,
  toStored,
  type DishRecipes,
  type RecipeLine,
} from '@/lib/inventory/dish-recipe/model'
import type { Recipe, RecipeComponent } from '@/types/database'
import { propertyParameters } from '../../utils/property'
import { GROUPS, UNITS } from './dish-recipe-fixtures'

const DISH = 'dish-1'
const unitById = new Map(UNITS.map((unit) => [unit.id, unit]))

/** Per ingredient, a choice of units that convert to each other. */
const INGREDIENT_UNITS: Record<string, string[]> = {
  milk: ['ml', 'l'],
  beans: ['g', 'kg'],
  cup: ['pc'],
  pearl: ['g'],
}
const OPTION_IDS = GROUPS.flatMap((group) => group.options.map((option) => option.id))

/** Quantities in steps of 0.1 base unit, so ml ⇄ l stays exact at 4 decimals. */
const lineArb: fc.Arbitrary<RecipeLine> = fc
  .record({ item: fc.constantFrom(...Object.keys(INGREDIENT_UNITS)), tenths: fc.integer({ min: 1, max: 5000 }), pick: fc.nat() })
  .map(({ item, tenths, pick }) => {
    const units = INGREDIENT_UNITS[item]
    const unitId = units[pick % units.length]
    const base = tenths / 10
    return { inventoryItemId: item, unitId, quantity: Math.round((base / unitById.get(unitId)!.to_base_factor) * 10_000) / 10_000 }
  })

const storedArb: fc.Arbitrary<DishRecipes> = fc.record({
  base: fc.array(lineArb, { maxLength: 4 }),
  options: fc.record(Object.fromEntries(OPTION_IDS.map((id) => [id, fc.array(lineArb, { maxLength: 3 })]))),
})

/** Every selection: one size or none, one sugar level or none, any add-ons. */
const SELECTIONS: string[][] = (() => {
  const sizes = [null, 'small', 'medium', 'large']
  const sugars = [null, 's25', 's100']
  const addons = [[], ['pearl'], ['shot'], ['pearl', 'shot']]
  return sizes.flatMap((size) =>
    sugars.flatMap((sugar) => addons.map((picked) => [size, sugar, ...picked].filter((id): id is string => id !== null))),
  )
})()

function asRows(stored: DishRecipes): { recipes: Recipe[]; components: RecipeComponent[] } {
  const recipes: Recipe[] = []
  const components: RecipeComponent[] = []
  const push = (id: string, columns: Partial<Recipe>, lines: RecipeLine[]) => {
    if (lines.length === 0) return
    recipes.push({ id, tenant_id: 't', created_at: '', updated_at: '', menu_item_id: DISH, ...columns } as Recipe)
    lines.forEach((line, index) =>
      components.push({
        id: `${id}-${index}`, tenant_id: 't', recipe_id: id, inventory_item_id: line.inventoryItemId,
        quantity: line.quantity, unit_id: line.unitId, sort_order: index, created_at: '', updated_at: '',
      }),
    )
  }
  push('base', { target_type: 'menu_item' }, stored.base)
  for (const [optionId, lines] of Object.entries(stored.options)) {
    push(`opt-${optionId}`, { target_type: 'modifier_option', modifier_option_id: optionId }, lines)
  }
  return { recipes, components }
}

/** What one unit of the dish with this selection deducts, per ingredient, in base units. */
function deducted(stored: DishRecipes, selection: string[]): Map<string, number> {
  const { recipes, components } = asRows(stored)
  const depletions = resolveOrderDepletions(
    [{ menuItemId: DISH, quantity: 1, optionIds: selection, modifierOptionIds: selection, addonIds: [] }],
    recipes,
    components,
  )
  const totals = new Map<string, number>()
  for (const depletion of depletions) {
    const factor = unitById.get(depletion.unitId)!.to_base_factor
    totals.set(depletion.inventoryItemId, (totals.get(depletion.inventoryItemId) ?? 0) + depletion.quantity * factor)
  }
  return totals
}

function expectSameDeductions(before: DishRecipes, after: DishRecipes) {
  for (const selection of SELECTIONS) {
    const a = deducted(before, selection)
    const b = deducted(after, selection)
    for (const item of new Set([...a.keys(), ...b.keys()])) {
      expect({ selection, item, quantity: b.get(item) ?? 0 }).toEqual({
        selection,
        item,
        quantity: expect.closeTo(a.get(item) ?? 0, 6),
      })
    }
  }
}

function expectStorable(stored: DishRecipes) {
  for (const line of [stored.base, ...Object.values(stored.options)].flat()) {
    expect(line.quantity).toBeGreaterThan(0)
  }
}

describe('dish recipe table keeps what a sale deducts', () => {
  it('opening and saving without edits changes no deduction, for any list as the table', () => {
    fc.assert(
      fc.property(storedArb, fc.constantFrom(null, 'size', 'sugar'), (stored, byGroupId) => {
        const saved = toStored(toDraft(stored, GROUPS, byGroupId, UNITS), GROUPS)
        expectStorable(saved)
        expectSameDeductions(stored, saved)
      }),
      propertyParameters(),
    )
  })

  it('switching the table between lists any number of times changes no deduction', () => {
    fc.assert(
      fc.property(storedArb, fc.array(fc.constantFrom(null, 'size', 'sugar'), { minLength: 1, maxLength: 5 }), (stored, path) => {
        let draft = toDraft(stored, GROUPS, null, UNITS)
        for (const byGroupId of path) draft = setByGroup(draft, GROUPS, byGroupId, UNITS)
        const saved = toStored(draft, GROUPS)
        expectStorable(saved)
        expectSameDeductions(stored, saved)
      }),
      propertyParameters(),
    )
  })

  it('a typed amount is exactly what that size deducts, with nothing negative stored', () => {
    const typedArb = fc.record({
      small: fc.option(fc.integer({ min: 1, max: 9000 }), { nil: null }),
      medium: fc.option(fc.integer({ min: 1, max: 9000 }), { nil: null }),
      large: fc.option(fc.integer({ min: 1, max: 9000 }), { nil: null }),
    })
    fc.assert(
      fc.property(storedArb, typedArb, (stored, typed) => {
        let draft = toDraft(stored, GROUPS, 'size', UNITS)
        const row = draft.rows[0]
        if (!row) return
        for (const [column, tenths] of Object.entries(typed)) {
          draft = setRowAmount(draft, row.key, column, tenths === null ? null : tenths / 10)
        }
        const saved = toStored(draft, GROUPS)
        expectStorable(saved)
        const factor = unitById.get(row.unitId)!.to_base_factor
        for (const [column, tenths] of Object.entries(typed)) {
          // That size alone, nothing else picked: the row's ingredient is its typed total,
          // plus what other rows of the same ingredient (another unit) hold.
          const sameItemOthers = draft.rows
            .filter((other) => other.key !== row.key && other.inventoryItemId === row.inventoryItemId)
            .reduce((sum, other) => sum + (other.amounts[column] ?? 0) * unitById.get(other.unitId)!.to_base_factor, 0)
          const expected = ((tenths ?? 0) / 10) * factor + sameItemOthers
          expect(deducted(saved, [column]).get(row.inventoryItemId) ?? 0).toBeCloseTo(expected, 3)
        }
      }),
      propertyParameters(),
    )
  })
})
