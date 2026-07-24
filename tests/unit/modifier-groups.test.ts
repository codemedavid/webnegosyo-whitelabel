import {
  LEGACY_ADDON_GROUP_NAME,
  LEGACY_VARIATION_GROUP_NAME,
  computeModifierSubtotal,
  isOptionAvailable,
  normalizeModifierGroups,
  resolveOptionCost,
  validateGroupSelection,
  type ModifierSource,
} from '@/lib/modifier-groups'
import type { ModifierGroup, ModifierOption, Variation } from '@/types/database'

// ---- helpers -------------------------------------------------------------

function option(overrides: Partial<ModifierOption> = {}): ModifierOption {
  return {
    id: overrides.id ?? 'opt',
    name: overrides.name ?? 'Option',
    price_modifier: overrides.price_modifier ?? 0,
    display_order: overrides.display_order ?? 0,
    ...overrides,
  }
}

function group(overrides: Partial<ModifierGroup> = {}): ModifierGroup {
  return {
    id: overrides.id ?? 'grp',
    name: overrides.name ?? 'Group',
    display_order: overrides.display_order ?? 0,
    min_select: overrides.min_select ?? 0,
    max_select: overrides.max_select ?? null,
    options: overrides.options ?? [option()],
  }
}

// ---- normalizeModifierGroups --------------------------------------------

describe('normalizeModifierGroups', () => {
  it('returns explicit modifier_groups when present, sorted by display_order', () => {
    const source: ModifierSource = {
      modifier_groups: [
        group({ id: 'b', name: 'Second', display_order: 1 }),
        group({ id: 'a', name: 'First', display_order: 0 }),
      ],
      variation_types: [],
      variations: [],
      addons: [],
    }

    const result = normalizeModifierGroups(source)

    expect(result.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('sorts options within a group by display_order', () => {
    const source: ModifierSource = {
      modifier_groups: [
        group({
          options: [
            option({ id: 'x', display_order: 2 }),
            option({ id: 'y', display_order: 0 }),
            option({ id: 'z', display_order: 1 }),
          ],
        }),
      ],
    }

    const [g] = normalizeModifierGroups(source)

    expect(g.options.map((o) => o.id)).toEqual(['y', 'z', 'x'])
  })

  it('derives a required single-select group from a required variation_type', () => {
    const source: ModifierSource = {
      variation_types: [
        {
          id: 'size',
          name: 'Size',
          is_required: true,
          display_order: 0,
          options: [
            { id: 's', name: 'Small', price_modifier: 0, is_default: true, display_order: 0 },
            { id: 'l', name: 'Large', price_modifier: 20, display_order: 1 },
          ],
        },
      ],
      variations: [],
      addons: [],
    }

    const result = normalizeModifierGroups(source)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ id: 'size', name: 'Size', min_select: 1, max_select: 1 })
    expect(result[0].options.map((o) => o.id)).toEqual(['s', 'l'])
    expect(result[0].options[1].price_modifier).toBe(20)
  })

  it('derives an optional single-select group from a non-required variation_type', () => {
    const source: ModifierSource = {
      variation_types: [
        { id: 'spice', name: 'Spice', is_required: false, display_order: 0, options: [] },
      ],
    }

    const [g] = normalizeModifierGroups(source)

    expect(g).toMatchObject({ min_select: 0, max_select: 1 })
  })

  it('derives an optional multi-select group from legacy addons', () => {
    const source: ModifierSource = {
      variation_types: [],
      variations: [],
      addons: [
        { id: 'cheese', name: 'Extra Cheese', price: 15 },
        { id: 'bacon', name: 'Bacon', price: 25 },
      ],
    }

    const result = normalizeModifierGroups(source)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      name: LEGACY_ADDON_GROUP_NAME,
      min_select: 0,
      max_select: null,
    })
    // addon.price maps to option.price_modifier
    expect(result[0].options.map((o) => o.price_modifier)).toEqual([15, 25])
  })

  it('derives a single-select group from legacy flat variations', () => {
    const source: ModifierSource = {
      variations: [
        { id: 's', name: 'Small', price_modifier: 0, is_default: true },
        { id: 'l', name: 'Large', price_modifier: 10 },
      ] as Variation[],
      addons: [],
    } as unknown as ModifierSource

    const result = normalizeModifierGroups(source)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ name: LEGACY_VARIATION_GROUP_NAME, max_select: 1 })
    expect(result[0].options.map((o) => o.name)).toEqual(['Small', 'Large'])
  })

  it('combines grouped variation_types AND addons into separate groups', () => {
    const source: ModifierSource = {
      variation_types: [
        { id: 'size', name: 'Size', is_required: true, display_order: 0, options: [] },
      ],
      variations: [],
      addons: [{ id: 'cheese', name: 'Extra Cheese', price: 15 }],
    }

    const result = normalizeModifierGroups(source)

    expect(result).toHaveLength(2)
    expect(result.map((g) => g.name)).toContain('Size')
    expect(result.map((g) => g.name)).toContain(LEGACY_ADDON_GROUP_NAME)
  })

  it('returns an empty array when the item has no modifiers', () => {
    expect(normalizeModifierGroups({ variation_types: [], variations: [], addons: [] })).toEqual([])
    expect(normalizeModifierGroups({})).toEqual([])
  })

  it('prefers grouped variation_types over legacy flat variations when both exist', () => {
    const source: ModifierSource = {
      variation_types: [
        { id: 'size', name: 'Size', is_required: true, display_order: 0, options: [] },
      ],
      variations: [{ id: 'legacy', name: 'Legacy', price_modifier: 0 }] as Variation[],
      addons: [],
    }

    const result = normalizeModifierGroups(source)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('size')
  })
})

// ---- validateGroupSelection ---------------------------------------------

describe('validateGroupSelection', () => {
  it('accepts exactly one for a required single-select group', () => {
    const g = group({ min_select: 1, max_select: 1 })
    expect(validateGroupSelection(g, ['a'])).toEqual({ valid: true })
  })

  it('rejects zero for a required group', () => {
    const g = group({ min_select: 1, max_select: 1 })
    expect(validateGroupSelection(g, []).valid).toBe(false)
  })

  it('rejects more than max for a single-select group', () => {
    const g = group({ min_select: 1, max_select: 1 })
    expect(validateGroupSelection(g, ['a', 'b']).valid).toBe(false)
  })

  it('accepts zero for an optional group', () => {
    const g = group({ min_select: 0, max_select: null })
    expect(validateGroupSelection(g, [])).toEqual({ valid: true })
  })

  it('accepts many for an unlimited multi-select group', () => {
    const g = group({ min_select: 0, max_select: null })
    expect(validateGroupSelection(g, ['a', 'b', 'c']).valid).toBe(true)
  })

  it('enforces a finite max on a multi-select group', () => {
    const g = group({ min_select: 0, max_select: 2 })
    expect(validateGroupSelection(g, ['a', 'b']).valid).toBe(true)
    expect(validateGroupSelection(g, ['a', 'b', 'c']).valid).toBe(false)
  })
})

// ---- computeModifierSubtotal --------------------------------------------

describe('computeModifierSubtotal', () => {
  it('sums base price and selected option modifiers times quantity', () => {
    const selected = [option({ price_modifier: 20 }), option({ price_modifier: 15 })]
    expect(computeModifierSubtotal(100, selected, 2)).toBe(270)
  })

  it('returns base times quantity when nothing is selected', () => {
    expect(computeModifierSubtotal(50, [], 3)).toBe(150)
  })

  it('rounds to cents', () => {
    const selected = [option({ price_modifier: 0.1 })]
    expect(computeModifierSubtotal(0.2, selected, 3)).toBe(0.9)
  })
})

// ---- isOptionAvailable ---------------------------------------------------

describe('isOptionAvailable', () => {
  it('is available for an untracked option', () => {
    expect(isOptionAvailable(option({ stock_mode: 'none' }))).toBe(true)
    expect(isOptionAvailable(option())).toBe(true)
  })

  it('is unavailable when explicitly disabled', () => {
    expect(isOptionAvailable(option({ is_available: false }))).toBe(false)
  })

  it('respects simple stock counts', () => {
    expect(isOptionAvailable(option({ stock_mode: 'simple', stock_qty: 5 }))).toBe(true)
    expect(isOptionAvailable(option({ stock_mode: 'simple', stock_qty: 0 }))).toBe(false)
    expect(isOptionAvailable(option({ stock_mode: 'simple' }))).toBe(false)
  })

  it('treats recipe-mode options as available (resolved with live stock elsewhere)', () => {
    expect(isOptionAvailable(option({ stock_mode: 'recipe' }))).toBe(true)
  })
})

// ---- resolveOptionCost ---------------------------------------------------

describe('resolveOptionCost', () => {
  it('uses the recipe cost when a recipe is attached', () => {
    expect(resolveOptionCost(5, 12)).toBe(12)
  })

  it('uses a recipe cost of 0 over a manual cost (recipe overrides)', () => {
    expect(resolveOptionCost(5, 0)).toBe(0)
  })

  it('falls back to the manual cost when no recipe is attached', () => {
    expect(resolveOptionCost(5, undefined)).toBe(5)
  })

  it('is zero when neither recipe nor manual cost exists', () => {
    expect(resolveOptionCost(undefined, undefined)).toBe(0)
  })
})
