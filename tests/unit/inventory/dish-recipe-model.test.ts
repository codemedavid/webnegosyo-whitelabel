import {
  addRow,
  changedTargets,
  defaultByGroup,
  dishRecipeGroups,
  EVERY_ORDER,
  fillRow,
  isDraftDirty,
  setByGroup,
  setRowAmount,
  toDraft,
  toStored,
  versionTotals,
  copyPicks,
  addPickLine,
  type DishRecipes,
} from '@/lib/inventory/dish-recipe/model'
import { findDraftProblems } from '@/lib/inventory/dish-recipe/validate'
import { GROUPS, INGREDIENTS, UNITS } from './dish-recipe-fixtures'

const latte: DishRecipes = {
  base: [
    { inventoryItemId: 'beans', quantity: 18, unitId: 'g' },
    { inventoryItemId: 'milk', quantity: 180, unitId: 'ml' },
  ],
  options: {
    small: [],
    medium: [{ inventoryItemId: 'milk', quantity: 40, unitId: 'ml' }],
    large: [{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }],
    pearl: [{ inventoryItemId: 'pearl', quantity: 14.3, unitId: 'g' }],
  },
}

describe('dish recipe model', () => {
  it('shows each size its TOTAL, not the extra the database stores', () => {
    const draft = toDraft(latte, GROUPS, 'size', UNITS)
    const milk = draft.rows.find((row) => row.inventoryItemId === 'milk')!
    expect(milk.amounts).toEqual({ small: 180, medium: 220, large: 250 })
    const beans = draft.rows.find((row) => row.inventoryItemId === 'beans')!
    expect(beans.amounts).toEqual({ small: 18, medium: 18, large: 18 })
    // Add-ons stay as "each pick adds".
    expect(draft.picks.pearl.map((line) => line.quantity)).toEqual([14.3])
    expect(draft.picks.small).toBeUndefined()
  })

  it('saves an unedited table back exactly as stored (no churn)', () => {
    const draft = toDraft(latte, GROUPS, 'size', UNITS)
    expect(changedTargets(latte, toStored(draft, GROUPS))).toEqual([])
    expect(isDraftDirty(latte, draft, GROUPS)).toBe(false)
  })

  it('puts the part every size shares into the dish recipe for a new ingredient', () => {
    let draft = toDraft(latte, GROUPS, 'size', UNITS)
    draft = addRow(draft, GROUPS, 'cup', 'pc', 1)
    const stored = toStored(draft, GROUPS)
    expect(stored.base).toContainEqual({ inventoryItemId: 'cup', quantity: 1, unitId: 'pc' })
    expect(stored.options.large.some((line) => line.inventoryItemId === 'cup')).toBe(false)
  })

  it('stores Small 12 / Medium 16 / Large 22 as 12 shared + 0 / 4 / 10', () => {
    let draft = toDraft({ base: [], options: {} }, GROUPS, 'size', UNITS)
    draft = addRow(draft, GROUPS, 'syrup', 'ml')
    const key = draft.rows[0].key
    draft = setRowAmount(draft, key, 'small', 12)
    draft = setRowAmount(draft, key, 'medium', 16)
    draft = setRowAmount(draft, key, 'large', 22)
    const stored = toStored(draft, GROUPS)
    expect(stored.base).toEqual([{ inventoryItemId: 'syrup', quantity: 12, unitId: 'ml' }])
    expect(stored.options.small).toEqual([])
    expect(stored.options.medium).toEqual([{ inventoryItemId: 'syrup', quantity: 4, unitId: 'ml' }])
    expect(stored.options.large).toEqual([{ inventoryItemId: 'syrup', quantity: 10, unitId: 'ml' }])
  })

  it('lowering one size below the stored dish amount moves the shared part down', () => {
    let draft = toDraft(latte, GROUPS, 'size', UNITS)
    const milk = draft.rows.find((row) => row.inventoryItemId === 'milk')!
    draft = setRowAmount(draft, milk.key, 'small', 150)
    const stored = toStored(draft, GROUPS)
    expect(stored.base).toContainEqual({ inventoryItemId: 'milk', quantity: 150, unitId: 'ml' })
    expect(stored.options.small).toEqual([])
    expect(stored.options.medium).toEqual([{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }])
    expect(stored.options.large).toEqual([{ inventoryItemId: 'milk', quantity: 100, unitId: 'ml' }])
  })

  it('a blank version uses none of that ingredient', () => {
    let draft = toDraft({ base: [], options: {} }, GROUPS, 'size', UNITS)
    draft = addRow(draft, GROUPS, 'pearl', 'g')
    const key = draft.rows[0].key
    draft = setRowAmount(draft, key, 'large', 20)
    const stored = toStored(draft, GROUPS)
    expect(stored.base).toEqual([])
    expect(stored.options.large).toEqual([{ inventoryItemId: 'pearl', quantity: 20, unitId: 'g' }])
  })

  it('"same for all" fills every version', () => {
    let draft = toDraft(latte, GROUPS, 'size', UNITS)
    const milk = draft.rows.find((row) => row.inventoryItemId === 'milk')!
    draft = fillRow(draft, GROUPS, milk.key, 200)
    const stored = toStored(draft, GROUPS)
    expect(stored.base).toContainEqual({ inventoryItemId: 'milk', quantity: 180, unitId: 'ml' })
    // Kept the stored dish amount (180) and moved 20 to every size: same totals, least change.
    expect(stored.options.small).toEqual([{ inventoryItemId: 'milk', quantity: 20, unitId: 'ml' }])
  })

  it('merges a choice line in another unit into the row (1 l → 1000 ml)', () => {
    const stored: DishRecipes = {
      base: [{ inventoryItemId: 'milk', quantity: 100, unitId: 'ml' }],
      options: { large: [{ inventoryItemId: 'milk', quantity: 0.05, unitId: 'l' }] },
    }
    const draft = toDraft(stored, GROUPS, 'size', UNITS)
    expect(draft.rows).toHaveLength(1)
    expect(draft.rows[0].amounts).toEqual({ small: 100, medium: 100, large: 150 })
  })

  it('without a table there is one "every order" column and every choice adds', () => {
    const draft = toDraft(latte, GROUPS, null, UNITS)
    expect(draft.rows.find((row) => row.inventoryItemId === 'milk')!.amounts).toEqual({ [EVERY_ORDER]: 180 })
    expect(draft.picks.large.map((line) => line.quantity)).toEqual([70])
    expect(changedTargets(latte, toStored(draft, GROUPS))).toEqual([])
  })

  it('switching the table to another list and back loses nothing', () => {
    const start = toDraft(latte, GROUPS, 'size', UNITS)
    const viaSugar = setByGroup(start, GROUPS, 'sugar', UNITS)
    const viaNone = setByGroup(viaSugar, GROUPS, null, UNITS)
    const back = setByGroup(viaNone, GROUPS, 'size', UNITS)
    expect(changedTargets(latte, toStored(back, GROUPS))).toEqual([])
  })

  it('opens on the list whose choices already carry recipes', () => {
    expect(defaultByGroup(latte, GROUPS)).toBe('size')
    expect(defaultByGroup({ base: latte.base, options: {} }, GROUPS)).toBeNull()
  })

  it('lists what each version takes per sale', () => {
    const totals = versionTotals(toDraft(latte, GROUPS, 'size', UNITS), GROUPS)
    expect(totals.map((total) => total.column)).toEqual(['small', 'medium', 'large'])
    expect(totals[2].lines).toContainEqual({ inventoryItemId: 'milk', quantity: 250, unitId: 'ml' })
  })

  it('copies one add-on\'s lines to others', () => {
    let draft = toDraft(latte, GROUPS, 'size', UNITS)
    draft = copyPicks(draft, 'pearl', ['shot'])
    expect(toStored(draft, GROUPS).options.shot).toEqual([{ inventoryItemId: 'pearl', quantity: 14.3, unitId: 'g' }])
  })

  it('refuses a row with no amount and a line in a unit that never converts', () => {
    let draft = toDraft({ base: [], options: {} }, GROUPS, 'size', UNITS)
    draft = addRow(draft, GROUPS, 'milk', 'ml')
    draft = addPickLine(draft, 'pearl', 'cone', 'g', 1)
    const problems = findDraftProblems(draft, GROUPS, INGREDIENTS, UNITS)
    expect(problems.map((problem) => problem.message)).toEqual([
      'Enter how much Fresh milk each version uses, or remove it.',
      expect.stringContaining('Cone is stocked in pc'),
    ])
  })
})

describe('dishRecipeGroups', () => {
  it('reads modifier groups as modifier options, pick-one by max_select 1', () => {
    const groups = dishRecipeGroups({
      modifier_groups: [
        { id: 'g1', name: 'Size', display_order: 0, min_select: 1, max_select: 1, options: [
          { id: 'a', name: 'Small', price_modifier: 0, display_order: 0 },
          { id: 'b', name: 'Large', price_modifier: 20, display_order: 1 },
        ] },
        { id: 'g2', name: 'Add-ons', display_order: 1, min_select: 0, max_select: null, options: [
          { id: 'c', name: 'Pearl', price_modifier: 10, display_order: 0 },
        ] },
      ],
      variations: [{ id: 'mirror', name: 'Mirror', price_modifier: 0 }],
    } as never)
    expect(groups.map((group) => [group.id, group.isPickOne, group.isRequired, group.options[0].targetType])).toEqual([
      ['g1', true, true, 'modifier_option'],
      ['g2', false, false, 'modifier_option'],
    ])
  })

  it('reads legacy sizes as variation options and legacy add-ons as add-ons', () => {
    const groups = dishRecipeGroups({
      variations: [
        { id: 'v1', name: 'Regular', price_modifier: 0 },
        { id: 'v2', name: 'Large', price_modifier: 20 },
      ],
      addons: [{ id: 'a1', name: 'Egg', price: 15 }],
    } as never)
    expect(groups.map((group) => [group.isPickOne, group.options.map((option) => option.targetType)])).toEqual([
      [true, ['variation_option', 'variation_option']],
      [false, ['addon']],
    ])
  })
})
