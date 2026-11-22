import { toDraft, toStored, type DishRecipeGroup, type DishRecipes } from '@/lib/inventory/dish-recipe/model'
import { countOnce, findCountedTwice, findDishRecipeIssues, findSameForEverySize, isSizeGroup } from '@/lib/inventory/dish-recipe/checks'
import { copyDishRecipes } from '@/lib/inventory/dish-recipe/copy'
import { ADDONS, GROUPS, SIZE, UNITS } from './dish-recipe-fixtures'

/** The live shape (Ice Cream Giant Cone, 2026-11-21): every flavour repeats the dish recipe. */
const FLAVOUR: DishRecipeGroup = {
  id: 'flavour',
  name: 'Flavor',
  isPickOne: true,
  isRequired: true,
  options: [
    { id: 'vanilla', name: 'Vanilla', targetType: 'modifier_option' },
    { id: 'choco', name: 'Chocolate', targetType: 'modifier_option' },
  ],
}
const cone = (extra: string) => [
  { inventoryItemId: 'cone', quantity: 1, unitId: 'pc' },
  { inventoryItemId: 'milk', quantity: 31.25, unitId: 'ml' },
  { inventoryItemId: extra, quantity: 12.5, unitId: 'g' },
]
const giantCone: DishRecipes = {
  base: [
    { inventoryItemId: 'cone', quantity: 1, unitId: 'pc' },
    { inventoryItemId: 'milk', quantity: 31.25, unitId: 'ml' },
  ],
  options: { vanilla: cone('vanilla-powder'), choco: cone('choco-powder') },
}

describe('counted twice', () => {
  it('flags an ingredient the dish AND every flavour hold in the same amount', () => {
    const issues = findCountedTwice(giantCone, [FLAVOUR], UNITS)
    expect(issues.map((issue) => issue.inventoryItemId).sort()).toEqual(['cone', 'milk'])
  })

  it('does not flag a choice that adds a DIFFERENT amount (a bigger size)', () => {
    const latte: DishRecipes = {
      base: [{ inventoryItemId: 'milk', quantity: 180, unitId: 'ml' }],
      options: {
        small: [{ inventoryItemId: 'milk', quantity: 10, unitId: 'ml' }],
        medium: [{ inventoryItemId: 'milk', quantity: 40, unitId: 'ml' }],
        large: [{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }],
      },
    }
    expect(findCountedTwice(latte, GROUPS, UNITS)).toEqual([])
  })

  it('never flags add-ons: an extra pearl on top of the pearl in the dish is real', () => {
    const stored: DishRecipes = {
      base: [{ inventoryItemId: 'pearl', quantity: 14.3, unitId: 'g' }],
      options: { pearl: [{ inventoryItemId: 'pearl', quantity: 14.3, unitId: 'g' }], shot: [{ inventoryItemId: 'pearl', quantity: 14.3, unitId: 'g' }] },
    }
    expect(findCountedTwice(stored, [ADDONS], UNITS)).toEqual([])
  })

  it('"Count it once" in the table: each flavour drops back to one cone', () => {
    const [issue] = findCountedTwice(giantCone, [FLAVOUR], UNITS).filter((i) => i.inventoryItemId === 'cone')
    const draft = toDraft(giantCone, [FLAVOUR], 'flavour', UNITS)
    expect(draft.rows.find((row) => row.inventoryItemId === 'cone')!.amounts).toEqual({ vanilla: 2, choco: 2 })
    const fixed = countOnce(draft, [FLAVOUR], issue, UNITS)
    expect(fixed.rows.find((row) => row.inventoryItemId === 'cone')!.amounts).toEqual({ vanilla: 1, choco: 1 })
    const stored = toStored(fixed, [FLAVOUR])
    expect(stored.base).toContainEqual({ inventoryItemId: 'cone', quantity: 1, unitId: 'pc' })
    expect(stored.options.vanilla.some((line) => line.inventoryItemId === 'cone')).toBe(false)
    // The flavour powder is untouched.
    expect(stored.options.vanilla).toContainEqual({ inventoryItemId: 'vanilla-powder', quantity: 12.5, unitId: 'g' })
    expect(findCountedTwice(stored, [FLAVOUR], UNITS).filter((i) => i.inventoryItemId === 'cone')).toEqual([])
  })

  it('"Count it once" outside the table removes the repeat from each choice', () => {
    const [issue] = findCountedTwice(giantCone, [FLAVOUR], UNITS).filter((i) => i.inventoryItemId === 'cone')
    const fixed = countOnce(toDraft(giantCone, [FLAVOUR], null, UNITS), [FLAVOUR], issue, UNITS)
    expect(fixed.picks.vanilla.map((line) => line.inventoryItemId)).toEqual(['milk', 'vanilla-powder'])
  })

  it('never takes more than the repeat from a version already fixed by hand', () => {
    const [issue] = findCountedTwice(giantCone, [FLAVOUR], UNITS).filter((i) => i.inventoryItemId === 'cone')
    const draft = toDraft(giantCone, [FLAVOUR], 'flavour', UNITS)
    const coneRow = draft.rows.find((row) => row.inventoryItemId === 'cone')!
    const handFixed = { ...draft, rows: draft.rows.map((row) => (row.key === coneRow.key ? { ...row, amounts: { vanilla: 1, choco: 2 } } : row)) }
    const fixed = countOnce(handFixed, [FLAVOUR], issue, UNITS)
    expect(fixed.rows.find((row) => row.key === coneRow.key)!.amounts).toEqual({ vanilla: 1, choco: 1 })
  })
})

describe('same for every size', () => {
  it('nudges a size list that changes nothing on a dish with a recipe', () => {
    const stored: DishRecipes = { base: [{ inventoryItemId: 'milk', quantity: 180, unitId: 'ml' }], options: {} }
    expect(findSameForEverySize(stored, GROUPS).map((issue) => issue.groupId)).toEqual(['size'])
  })

  it('stays quiet once any size has its own amount, or the dish has no recipe', () => {
    expect(findSameForEverySize({ base: [], options: {} }, GROUPS)).toEqual([])
    const stored: DishRecipes = {
      base: [{ inventoryItemId: 'milk', quantity: 180, unitId: 'ml' }],
      options: { large: [{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }] },
    }
    expect(findSameForEverySize(stored, GROUPS)).toEqual([])
  })

  it('knows sizes by the list name or by two size-like choices', () => {
    expect(isSizeGroup(SIZE)).toBe(true)
    expect(isSizeGroup({ ...SIZE, name: 'Choose', options: [
      { id: 'a', name: '16 oz', targetType: 'modifier_option' },
      { id: 'b', name: '22oz', targetType: 'modifier_option' },
    ] })).toBe(true)
    expect(isSizeGroup(FLAVOUR)).toBe(false)
  })

  it('reports both kinds together', () => {
    expect(findDishRecipeIssues(giantCone, [FLAVOUR], UNITS).every((issue) => issue.kind === 'counted_twice')).toBe(true)
  })
})

describe('copy from another dish', () => {
  it('copies the dish recipe and matches choices by list + name, then by name', () => {
    const source = {
      groups: [SIZE],
      recipes: {
        base: [{ inventoryItemId: 'cup', quantity: 1, unitId: 'pc' }],
        options: { large: [{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }] },
      },
    }
    const target: DishRecipeGroup[] = [{
      ...SIZE,
      id: 'other-size',
      name: 'size',
      options: [
        { id: 't-large', name: 'LARGE', targetType: 'variation_option' },
        { id: 't-xl', name: 'XL', targetType: 'variation_option' },
      ],
    }]
    const result = copyDishRecipes(source, target)
    expect(result.recipes.base).toEqual([{ inventoryItemId: 'cup', quantity: 1, unitId: 'pc' }])
    expect(result.recipes.options['t-large']).toEqual([{ inventoryItemId: 'milk', quantity: 70, unitId: 'ml' }])
    expect(result.recipes.options['t-xl']).toEqual([])
    expect(result.matchedOptionIds).toEqual(['t-large'])
  })
})
