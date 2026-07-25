import {
  createModifierGroup,
  createModifierOption,
  serializeGroups,
  setGroupMultiple,
  setGroupRequired,
  splitGroupsToLegacyColumns,
} from '@/lib/modifier-groups-form'
import type { ModifierGroup, ModifierOption } from '@/types/database'

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
    // Respect an explicit null (unlimited); only default when the key is absent.
    max_select: 'max_select' in overrides ? overrides.max_select! : 1,
    options: overrides.options ?? [option()],
  }
}

// ---- factories -----------------------------------------------------------

describe('createModifierGroup', () => {
  it('creates an optional single-select group with no options', () => {
    const g = createModifierGroup('g1', 2)
    expect(g).toEqual({
      id: 'g1',
      name: '',
      display_order: 2,
      min_select: 0,
      max_select: 1,
      options: [],
    })
  })
})

describe('createModifierOption', () => {
  it('creates a zero-price untracked option', () => {
    const o = createModifierOption('o1', 3)
    expect(o).toMatchObject({
      id: 'o1',
      name: '',
      price_modifier: 0,
      display_order: 3,
      stock_mode: 'none',
    })
  })
})

// ---- setGroupMultiple / setGroupRequired (immutable) ---------------------

describe('setGroupMultiple', () => {
  it('switching to multi-select clears the max cap (null = unlimited)', () => {
    const g = group({ min_select: 1, max_select: 1 })
    const next = setGroupMultiple(g, true)
    expect(next.max_select).toBeNull()
    expect(g.max_select).toBe(1) // original untouched (immutability)
  })

  it('switching to single-select caps max at 1 and clamps min to <= 1', () => {
    const g = group({ min_select: 3, max_select: null })
    const next = setGroupMultiple(g, false)
    expect(next.max_select).toBe(1)
    expect(next.min_select).toBe(1)
  })

  it('single-select with min 0 stays optional when switching', () => {
    const g = group({ min_select: 0, max_select: null })
    expect(setGroupMultiple(g, false).min_select).toBe(0)
  })
})

describe('setGroupRequired', () => {
  it('marking required raises min_select to at least 1, preserving max', () => {
    const g = group({ min_select: 0, max_select: null })
    const next = setGroupRequired(g, true)
    expect(next.min_select).toBe(1)
    expect(next.max_select).toBeNull()
  })

  it('marking not-required drops min_select to 0', () => {
    const g = group({ min_select: 2, max_select: 3 })
    expect(setGroupRequired(g, false).min_select).toBe(0)
  })
})

// ---- serializeGroups -----------------------------------------------------

describe('serializeGroups', () => {
  it('drops options with a blank name and reindexes display_order', () => {
    const g = group({
      options: [
        option({ id: 'a', name: 'Keep', display_order: 5 }),
        option({ id: 'b', name: '   ', display_order: 6 }),
        option({ id: 'c', name: 'Also', display_order: 7 }),
      ],
    })
    const [out] = serializeGroups([g])
    expect(out.options.map((o) => o.id)).toEqual(['a', 'c'])
    expect(out.options.map((o) => o.display_order)).toEqual([0, 1])
  })

  it('drops groups that end up with no options', () => {
    const empty = group({ id: 'empty', options: [option({ name: '' })] })
    const full = group({ id: 'full', options: [option({ name: 'Ok' })] })
    expect(serializeGroups([empty, full]).map((g) => g.id)).toEqual(['full'])
  })

  it('trims group and option names and reindexes group display_order', () => {
    const g = group({ name: '  Size  ', display_order: 9, options: [option({ name: ' Large ' })] })
    const [out] = serializeGroups([g])
    expect(out.name).toBe('Size')
    expect(out.display_order).toBe(0)
    expect(out.options[0].name).toBe('Large')
  })
})

// ---- splitGroupsToLegacyColumns (backward-compat contract) ---------------

describe('splitGroupsToLegacyColumns', () => {
  it('maps a single-select group to a variation_type; required from min_select', () => {
    const g = group({
      id: 'size',
      name: 'Size',
      min_select: 1,
      max_select: 1,
      options: [
        option({ id: 's', name: 'Small', price_modifier: 0, is_default: true }),
        option({ id: 'l', name: 'Large', price_modifier: 20 }),
      ],
    })
    const { variation_types, addons } = splitGroupsToLegacyColumns([g])
    expect(addons).toEqual([])
    expect(variation_types).toHaveLength(1)
    expect(variation_types[0]).toMatchObject({ id: 'size', name: 'Size', is_required: true })
    expect(variation_types[0].options.map((o) => o.name)).toEqual(['Small', 'Large'])
    expect(variation_types[0].options[1].price_modifier).toBe(20)
  })

  it('flattens a multi-select group into addons (price from price_modifier)', () => {
    const g = group({
      id: 'extras',
      max_select: null,
      options: [
        option({ id: 'cheese', name: 'Extra Cheese', price_modifier: 15 }),
        option({ id: 'bacon', name: 'Bacon', price_modifier: 25 }),
      ],
    })
    const { variation_types, addons } = splitGroupsToLegacyColumns([g])
    expect(variation_types).toEqual([])
    expect(addons).toEqual([
      { id: 'cheese', name: 'Extra Cheese', price: 15 },
      { id: 'bacon', name: 'Bacon', price: 25 },
    ])
  })

  it('handles mixed groups and never emits legacy flat variations', () => {
    const single = group({ id: 'size', max_select: 1, options: [option({ id: 's', name: 'S' })] })
    const multi = group({ id: 'add', max_select: null, options: [option({ id: 'c', name: 'Cheese', price_modifier: 10 })] })
    const result = splitGroupsToLegacyColumns([single, multi])
    expect(result.variation_types.map((v) => v.id)).toEqual(['size'])
    expect(result.addons.map((a) => a.id)).toEqual(['c'])
    expect(result.variations).toEqual([])
  })

  it('treats a finite max > 1 as multi-select (addons)', () => {
    const g = group({ id: 'pick2', max_select: 2, options: [option({ id: 'x', name: 'X', price_modifier: 5 })] })
    const { variation_types, addons } = splitGroupsToLegacyColumns([g])
    expect(variation_types).toEqual([])
    expect(addons).toEqual([{ id: 'x', name: 'X', price: 5 }])
  })
})
