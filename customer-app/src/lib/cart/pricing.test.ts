import { VALID_CATALOG } from '@/fixtures/contract-fixtures'
import type { AppMenuItem } from '@/lib/contract'
import {
  defaultSelections,
  describeSelections,
  setOptionQuantity,
  toggleOption,
  unitPriceCentavos,
  validateSelections,
} from './pricing'

const latte = VALID_CATALOG.items.find((item) => item.id === 'item-latte') as AppMenuItem
const [size, milk, extras] = latte.modifierGroups

describe('defaultSelections', () => {
  it('preselects each group default', () => {
    const selections = defaultSelections(latte)
    expect(selections.size).toEqual({ tall: 1 })
    expect(selections.milk).toEqual({ whole: 1 })
    expect(selections.extras).toEqual({})
  })

  it('preselects the first available option of a required single choice without a default', () => {
    const item: AppMenuItem = {
      ...latte,
      modifierGroups: [
        {
          ...size,
          options: size.options.map((option, index) => ({ ...option, isDefault: false, isAvailable: index !== 0 })),
        },
      ],
    }
    expect(defaultSelections(item).size).toEqual({ grande: 1 })
  })
})

describe('toggleOption', () => {
  it('replaces the pick in a single-choice group and never mutates', () => {
    const before = defaultSelections(latte)
    const after = toggleOption(size, before, 'venti')
    expect(after.size).toEqual({ venti: 1 })
    expect(before.size).toEqual({ tall: 1 })
  })

  it('does not unselect a required single choice', () => {
    const selections = defaultSelections(latte)
    expect(toggleOption(size, selections, 'tall').size).toEqual({ tall: 1 })
  })

  it('refuses a pick past the group maximum', () => {
    const group = { ...extras, selectionMode: 'choice' as const, maxSelect: 2 }
    const two = toggleOption(group, toggleOption(group, {}, 'shot'), 'syrup')
    const three = toggleOption(group, two, 'cream')
    expect(three.extras).toEqual({ shot: 1, syrup: 1 })
  })

  it('ignores an unavailable option', () => {
    const group = { ...milk, options: milk.options.map((option) => ({ ...option, isAvailable: option.id !== 'oat' })) }
    expect(toggleOption(group, defaultSelections(latte), 'oat').milk).toEqual({ whole: 1 })
  })
})

describe('setOptionQuantity', () => {
  it('sets and removes quantities', () => {
    const two = setOptionQuantity(extras, {}, 'shot', 2)
    expect(two.extras).toEqual({ shot: 2 })
    expect(setOptionQuantity(extras, two, 'shot', 0).extras).toEqual({})
  })

  it('clamps to the group maximum across options', () => {
    const group = { ...extras, maxSelect: 3 }
    const withSyrup = setOptionQuantity(group, {}, 'syrup', 2)
    expect(setOptionQuantity(group, withSyrup, 'shot', 5).extras).toEqual({ syrup: 2, shot: 1 })
  })
})

describe('validateSelections', () => {
  it('passes the defaults', () => {
    expect(validateSelections(latte, defaultSelections(latte)).isValid).toBe(true)
  })

  it('reports a missing required group by name', () => {
    const result = validateSelections(latte, { ...defaultSelections(latte), size: {} })
    expect(result.isValid).toBe(false)
    expect(result.issues).toEqual([{ groupId: 'size', message: 'Choose a Size' }])
  })
})

describe('unitPriceCentavos', () => {
  it('adds every picked option times its count', () => {
    let selections = defaultSelections(latte)
    selections = toggleOption(size, selections, 'grande')
    selections = toggleOption(milk, selections, 'oat')
    selections = setOptionQuantity(extras, selections, 'shot', 2)
    // 145 + 20 + 30 + 2 × 35
    expect(unitPriceCentavos(latte, selections)).toBe(26500)
  })

  it('ignores selections for groups or options the item no longer has', () => {
    expect(unitPriceCentavos(latte, { ghost: { x: 3 }, size: { gone: 1 } })).toBe(14500)
  })
})

describe('describeSelections', () => {
  it('lists picks in group order with counts', () => {
    let selections = defaultSelections(latte)
    selections = setOptionQuantity(extras, selections, 'shot', 2)
    expect(describeSelections(latte, selections)).toEqual(['Tall 12oz', 'Whole milk', '2× Extra espresso shot'])
  })
})
