import { describe, it, expect } from '@jest/globals'
import { addSingleAddons, placeLibraryGroup } from '@/lib/addon-groups/place-group'
import { applyLibraryGroupToDish } from '@/lib/addon-groups/apply-to-dish'
import type { AddonLibraryEntry, ModifierGroup, ModifierGroupLibraryEntry } from '@/types/database'

/**
 * Putting a saved add-on group on a dish.
 *
 * The old attach skipped any group whose name the dish already had. A store's
 * menu import had put an "Add-ons" group at ₱0 on 67 dishes, so attaching the
 * priced "Add-ons" group from the library did nothing ("already on this item")
 * and the owner saved it to the library 27 times trying. A same-name group can
 * now be REPLACED, and the caller says which it wants.
 */

const counter = () => {
  let n = 0
  return () => `id-${++n}`
}

const entry = (overrides: Partial<ModifierGroupLibraryEntry> = {}): ModifierGroupLibraryEntry => ({
  id: 'lib-1',
  tenant_id: 't1',
  name: 'Add-ons',
  selection_mode: 'quantity',
  min_select: 0,
  max_select: null,
  options: [
    { id: 'x', name: 'Fried Rice', price_modifier: 15, display_order: 0 },
    { id: 'y', name: 'Egg', price_modifier: 20, display_order: 1 },
  ],
  is_active: true,
  display_order: 0,
  created_at: '2026-10-28T00:00:00Z',
  updated_at: '2026-10-28T00:00:00Z',
  ...overrides,
})

const size: ModifierGroup = {
  id: 'g-size', name: 'Size', display_order: 0, min_select: 1, max_select: 1,
  options: [{ id: 'o-solo', name: 'Solo', price_modifier: 0, display_order: 0 }],
}

const freeAddons: ModifierGroup = {
  id: 'g-old', name: 'add-ons ', selection_mode: 'quantity', display_order: 1, min_select: 0, max_select: null,
  options: [{ id: 'o-rice', name: 'Fried Rice', price_modifier: 0, display_order: 0 }],
}

describe('placeLibraryGroup', () => {
  it('appends a group the dish does not have, after its other groups', () => {
    const result = placeLibraryGroup([size], entry(), 'replace', counter())

    expect(result.outcome).toBe('added')
    expect(result.groups.map((g) => [g.name, g.display_order])).toEqual([['Size', 0], ['Add-ons', 1]])
    expect(result.groups[1].options.map((o) => [o.id, o.name, o.price_modifier])).toEqual([
      ['id-2', 'Fried Rice', 15],
      ['id-3', 'Egg', 20],
    ])
  })

  it('replaces a same-name group in place, matching names loosely', () => {
    const result = placeLibraryGroup([size, freeAddons], entry(), 'replace', counter())

    expect(result.outcome).toBe('replaced')
    expect(result.groups).toHaveLength(2)
    expect(result.groups[1]).toMatchObject({ name: 'Add-ons', display_order: 1, selection_mode: 'quantity' })
    expect(result.groups[1].options.map((o) => o.price_modifier)).toEqual([15, 20])
  })

  it('leaves the dish alone when asked to skip a same-name group', () => {
    const groups = [size, freeAddons]
    const result = placeLibraryGroup(groups, entry(), 'skip', counter())

    expect(result.outcome).toBe('skipped')
    expect(result.groups).toEqual(groups)
  })
})

describe('addSingleAddons', () => {
  const single = (id: string, name: string, price: number): AddonLibraryEntry => ({
    id, tenant_id: 't1', name, price, is_active: true, display_order: 0, created_at: '', updated_at: '',
  })

  it('adds single add-ons to the dish’s add-ons group, skipping names it has', () => {
    const result = addSingleAddons([size, freeAddons], [single('s1', 'fried rice', 15), single('s2', 'Gravy', 10)], counter())

    expect(result.added).toBe(1)
    expect(result.groups[1].options.map((o) => [o.name, o.price_modifier, o.display_order])).toEqual([
      ['Fried Rice', 0, 0],
      ['Gravy', 10, 1],
    ])
  })

  it('creates an optional add-ons group when the dish has none', () => {
    const result = addSingleAddons([size], [single('s1', 'Egg', 20)], counter())

    expect(result.added).toBe(1)
    expect(result.groups[1]).toMatchObject({
      name: 'Add-ons', selection_mode: 'quantity', min_select: 0, max_select: null, display_order: 1,
    })
  })

  it('changes nothing when every add-on is already there', () => {
    const groups = [size, freeAddons]
    expect(addSingleAddons(groups, [single('s1', 'Fried Rice', 15)], counter())).toEqual({ groups, added: 0 })
  })
})

describe('applyLibraryGroupToDish', () => {
  it('turns a dish with only legacy add-ons into groups and replaces its free add-ons', () => {
    const dish = {
      modifier_groups: [],
      variation_types: [],
      variations: [],
      addons: [{ id: 'a1', name: 'Fried Rice', price: 0 }, { id: 'a2', name: 'Egg', price: 0 }],
    }

    const result = applyLibraryGroupToDish(dish, entry(), 'replace', counter())

    expect(result.outcome).toBe('replaced')
    expect(result.patch?.modifier_groups).toHaveLength(1)
    expect(result.patch?.modifier_groups[0].options.map((o) => o.price_modifier)).toEqual([15, 20])
    // The legacy columns are kept in step, as the dish editor does on save.
    expect(result.patch?.addons.map((a) => [a.name, a.price])).toEqual([['Fried Rice', 15], ['Egg', 20]])
    expect(result.patch?.variation_types).toEqual([])
  })

  it('keeps a single-select group in variation_types for older readers', () => {
    const result = applyLibraryGroupToDish({ modifier_groups: [] }, entry({ name: 'Size', selection_mode: 'choice', min_select: 1, max_select: 1 }), 'replace', counter())

    expect(result.outcome).toBe('added')
    expect(result.patch?.variation_types.map((t) => t.name)).toEqual(['Size'])
    expect(result.patch?.addons).toEqual([])
  })

  it('returns no patch when the dish is skipped', () => {
    expect(applyLibraryGroupToDish({ modifier_groups: [freeAddons] }, entry(), 'skip', counter())).toEqual({
      outcome: 'skipped',
      patch: null,
    })
  })

  it('omits stock counters it did not change, so the database keeps the live value', () => {
    const stocked: ModifierGroup = {
      ...size,
      options: [{ id: 'o-solo', name: 'Solo', price_modifier: 0, display_order: 0, stock_mode: 'simple', stock_qty: 4 }],
    }

    const result = applyLibraryGroupToDish({ modifier_groups: [stocked] }, entry(), 'replace', counter())

    expect(result.patch?.modifier_groups[0].options[0]).not.toHaveProperty('stock_qty')
    expect(result.patch?.modifier_groups[0].options[0].stock_mode).toBe('simple')
  })

  it('keeps the old option id and stock when replacing an option with the same name', () => {
    // Saved carts and stock ceilings point at option ids: fresh ids would make
    // a saved cart's Fried Rice unknown (priced at nothing) and drop its stock.
    const stockedAddons: ModifierGroup = {
      ...freeAddons,
      options: [{ id: 'o-rice', name: 'Fried Rice', price_modifier: 0, display_order: 0, stock_mode: 'simple', stock_qty: 7 }],
    }

    const result = applyLibraryGroupToDish({ modifier_groups: [size, stockedAddons] }, entry(), 'replace', counter())

    const options = result.patch?.modifier_groups[1].options ?? []
    expect(options.map((o) => [o.id, o.name, o.price_modifier])).toEqual([
      ['o-rice', 'Fried Rice', 15],
      ['id-3', 'Egg', 20],
    ])
    expect(options[0].stock_mode).toBe('simple')
    // Unchanged counter omitted: the database keeps the live count.
    expect(options[0]).not.toHaveProperty('stock_qty')
  })
})
