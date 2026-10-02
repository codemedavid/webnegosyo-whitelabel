import {
  describeChoiceCount,
  describeExtraCharge,
  summarizeLegacyOptions,
  summarizeModifierGroups,
} from '@/lib/menu-editor/option-summary'
import type { ModifierGroup } from '@/types/database'

describe('describeExtraCharge', () => {
  it('says nothing for a zero charge and signs a positive one', () => {
    expect(describeExtraCharge(0)).toBe('')
    expect(describeExtraCharge(20)).toMatch(/^\+₱20/)
  })

  it('treats a missing or broken number as no charge', () => {
    expect(describeExtraCharge(Number.NaN)).toBe('')
  })
})

describe('summarizeLegacyOptions', () => {
  it('lists a flat size list under "Size" and skips unnamed rows', () => {
    const lines = summarizeLegacyOptions({
      isGrouped: false,
      variations: [
        { id: 'a', name: 'Regular', price_modifier: 0 },
        { id: 'b', name: 'Large', price_modifier: 25 },
        { id: 'c', name: '  ', price_modifier: 5 },
      ],
      variationTypes: [],
      addons: [],
    })

    expect(lines).toHaveLength(1)
    expect(lines[0].label).toBe('Size')
    expect(lines[0].values[0]).toBe('Regular')
    expect(lines[0].values[1]).toMatch(/^Large \+₱25/)
  })

  it('lists each choice list by its own name and ignores the flat list', () => {
    const lines = summarizeLegacyOptions({
      isGrouped: true,
      variations: [{ id: 'stale', name: 'Old', price_modifier: 0 }],
      variationTypes: [
        { id: 't', name: 'Spice level', is_required: false, display_order: 0, options: [
          { id: 'm', name: 'Mild', price_modifier: 0, display_order: 0 },
        ] },
        { id: 'u', name: '', is_required: false, display_order: 1, options: [
          { id: 'x', name: 'Hot', price_modifier: 0, display_order: 0 },
        ] },
      ],
      addons: [{ id: 'ad', name: 'Extra egg', price: 15 }],
    })

    expect(lines.map((line) => line.label)).toEqual(['Spice level', 'Choice 2', 'Add-ons'])
    expect(lines[2].values[0]).toMatch(/^Extra egg \+₱15/)
  })

  it('drops lists that have no named options', () => {
    const lines = summarizeLegacyOptions({
      isGrouped: true,
      variations: [],
      variationTypes: [{ id: 't', name: 'Size', is_required: true, display_order: 0, options: [] }],
      addons: [{ id: 'ad', name: '', price: 0 }],
    })
    expect(lines).toEqual([])
  })
})

describe('summarizeModifierGroups', () => {
  it('summarizes each named group with its options', () => {
    const groups: ModifierGroup[] = [
      { id: 'g', name: 'Flavor', display_order: 0, min_select: 1, max_select: 1, options: [
        { id: 'o', name: 'Garlic', price_modifier: 0, display_order: 0 },
        { id: 'p', name: 'Cheese', price_modifier: 10, display_order: 1 },
      ] },
    ]
    const lines = summarizeModifierGroups(groups)
    expect(lines[0].label).toBe('Flavor')
    expect(lines[0].values).toHaveLength(2)
  })
})

describe('describeChoiceCount', () => {
  it('names sizes for a size list and choices for choice lists', () => {
    expect(describeChoiceCount(false, 3)).toBe('3 sizes')
    expect(describeChoiceCount(true, 1)).toBe('1 choice')
    expect(describeChoiceCount(true, 0)).toBeUndefined()
  })
})
