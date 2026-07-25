import { buildRecipeTargetColumns, type RecipeTarget } from '@/lib/inventory/recipe-target'

describe('buildRecipeTargetColumns', () => {
  it('keys a menu_item recipe by menu_item_id only', () => {
    const cols = buildRecipeTargetColumns({ type: 'menu_item', menuItemId: 'm1' })
    expect(cols).toEqual({
      target_type: 'menu_item',
      menu_item_id: 'm1',
      variation_option_id: null,
      addon_id: null,
      modifier_option_id: null,
      prep_item_id: null,
    })
  })

  it('keys a variation_option recipe by menu_item_id + variation_option_id', () => {
    const cols = buildRecipeTargetColumns({
      type: 'variation_option',
      menuItemId: 'm1',
      variationOptionId: 'v1',
    })
    expect(cols.target_type).toBe('variation_option')
    expect(cols.menu_item_id).toBe('m1')
    expect(cols.variation_option_id).toBe('v1')
    expect(cols.addon_id).toBeNull()
    expect(cols.modifier_option_id).toBeNull()
    expect(cols.prep_item_id).toBeNull()
  })

  it('keys an addon recipe by menu_item_id + addon_id', () => {
    const cols = buildRecipeTargetColumns({ type: 'addon', menuItemId: 'm1', addonId: 'a1' })
    expect(cols.target_type).toBe('addon')
    expect(cols.menu_item_id).toBe('m1')
    expect(cols.addon_id).toBe('a1')
    expect(cols.variation_option_id).toBeNull()
    expect(cols.modifier_option_id).toBeNull()
  })

  it('keys a modifier_option recipe by menu_item_id + modifier_option_id (the unified path)', () => {
    const cols = buildRecipeTargetColumns({
      type: 'modifier_option',
      menuItemId: 'm1',
      modifierOptionId: 'opt-42',
    })
    expect(cols.target_type).toBe('modifier_option')
    expect(cols.menu_item_id).toBe('m1')
    expect(cols.modifier_option_id).toBe('opt-42')
    expect(cols.variation_option_id).toBeNull()
    expect(cols.addon_id).toBeNull()
    expect(cols.prep_item_id).toBeNull()
  })

  it('keys a prep_item recipe by prep_item_id only, with no menu_item_id', () => {
    const cols = buildRecipeTargetColumns({ type: 'prep_item', prepItemId: 'p1' })
    expect(cols.target_type).toBe('prep_item')
    expect(cols.prep_item_id).toBe('p1')
    expect(cols.menu_item_id).toBeNull()
    expect(cols.modifier_option_id).toBeNull()
  })

  it('rejects a target whose required id is blank', () => {
    expect(() =>
      buildRecipeTargetColumns({ type: 'modifier_option', menuItemId: 'm1', modifierOptionId: '  ' }),
    ).toThrow(/modifier/i)
    expect(() =>
      buildRecipeTargetColumns({ type: 'menu_item', menuItemId: '' }),
    ).toThrow(/menu item/i)
  })

  it('trims surrounding whitespace on id fields', () => {
    const cols = buildRecipeTargetColumns({
      type: 'modifier_option',
      menuItemId: '  m1 ',
      modifierOptionId: ' opt-1 ',
    })
    expect(cols.menu_item_id).toBe('m1')
    expect(cols.modifier_option_id).toBe('opt-1')
  })
})
