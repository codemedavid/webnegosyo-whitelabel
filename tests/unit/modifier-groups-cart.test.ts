/**
 * Phase 2 (storefront) — pure selection adapter for unified modifier groups.
 *
 * These functions bridge the normalized `ModifierGroup[]` model to the existing
 * cart pipeline. The customer picks option ids per group; the adapter tracks the
 * selection immutably, honours single- vs multi-select rules, validates min/max,
 * and maps the selection back into the legacy `selected_variations` /
 * `selected_addons` shapes so `calculateCartItemSubtotal` (and the messenger /
 * order pipeline built on it) keep working unchanged.
 */

import type { ModifierGroup } from '@/types/database'
import { calculateCartItemSubtotal } from '@/lib/cart-utils'
import { computeModifierSubtotal } from '@/lib/modifier-groups'
import {
  getDefaultSelection,
  toggleOption,
  getSelectedOptions,
  mapSelectionToCartFormat,
  validateAllGroups,
  type ModifierSelection,
} from '@/lib/modifier-groups-cart'

// ---- Fixtures ---------------------------------------------------------------

const sizeGroup: ModifierGroup = {
  id: 'g-size',
  name: 'Size',
  display_order: 0,
  min_select: 1, // required single-select
  max_select: 1,
  options: [
    { id: 'o-small', name: 'Small', price_modifier: 0, display_order: 0 },
    { id: 'o-large', name: 'Large', price_modifier: 20, display_order: 1, is_default: true },
  ],
}

const spiceGroup: ModifierGroup = {
  id: 'g-spice',
  name: 'Spice',
  display_order: 1,
  min_select: 0, // optional single-select
  max_select: 1,
  options: [
    { id: 'o-mild', name: 'Mild', price_modifier: 0, display_order: 0 },
    { id: 'o-hot', name: 'Hot', price_modifier: 0, display_order: 1 },
  ],
}

const addonGroup: ModifierGroup = {
  id: 'g-addons',
  name: 'Add-ons',
  display_order: 2,
  min_select: 0,
  max_select: null, // unlimited multi-select
  options: [
    { id: 'o-cheese', name: 'Extra Cheese', price_modifier: 15, display_order: 0 },
    { id: 'o-bacon', name: 'Bacon', price_modifier: 25, display_order: 1, is_default: true },
    { id: 'o-egg', name: 'Egg', price_modifier: 10, display_order: 2 },
  ],
}

const cappedMultiGroup: ModifierGroup = {
  id: 'g-dips',
  name: 'Dips (max 2)',
  display_order: 3,
  min_select: 0,
  max_select: 2,
  options: [
    { id: 'o-ketchup', name: 'Ketchup', price_modifier: 5, display_order: 0 },
    { id: 'o-mayo', name: 'Mayo', price_modifier: 5, display_order: 1 },
    { id: 'o-mustard', name: 'Mustard', price_modifier: 5, display_order: 2 },
  ],
}

const groups: ModifierGroup[] = [sizeGroup, spiceGroup, addonGroup]

// ---- getDefaultSelection ----------------------------------------------------

describe('getDefaultSelection', () => {
  it('selects the is_default option for a single-select group', () => {
    const selection = getDefaultSelection([sizeGroup])
    expect(selection['g-size']).toEqual(['o-large'])
  })

  it('selects the first option for a required single-select with no explicit default', () => {
    const required: ModifierGroup = { ...sizeGroup, options: sizeGroup.options.map((o) => ({ ...o, is_default: false })) }
    const selection = getDefaultSelection([required])
    expect(selection['g-size']).toEqual(['o-small'])
  })

  it('leaves an optional single-select group empty when no default is set', () => {
    const selection = getDefaultSelection([spiceGroup])
    expect(selection['g-spice']).toEqual([])
  })

  it('selects only the is_default options for a multi-select group', () => {
    const selection = getDefaultSelection([addonGroup])
    expect(selection['g-addons']).toEqual(['o-bacon'])
  })

  it('skips an unavailable option when picking the default for a required single-select', () => {
    const withUnavailableFirst: ModifierGroup = {
      ...sizeGroup,
      options: [
        { id: 'o-small', name: 'Small', price_modifier: 0, display_order: 0, is_available: false },
        { id: 'o-large', name: 'Large', price_modifier: 20, display_order: 1 },
      ],
    }
    const selection = getDefaultSelection([withUnavailableFirst])
    expect(selection['g-size']).toEqual(['o-large'])
  })
})

// ---- toggleOption -----------------------------------------------------------

describe('toggleOption', () => {
  it('replaces the current pick in a single-select group', () => {
    const start: ModifierSelection = { 'g-size': ['o-small'] }
    const next = toggleOption(start, sizeGroup, 'o-large')
    expect(next['g-size']).toEqual(['o-large'])
  })

  it('does not mutate the input selection (immutability)', () => {
    const start: ModifierSelection = { 'g-size': ['o-small'] }
    toggleOption(start, sizeGroup, 'o-large')
    expect(start['g-size']).toEqual(['o-small'])
  })

  it('adds then removes an option in a multi-select group', () => {
    const added = toggleOption({}, addonGroup, 'o-cheese')
    expect(added['g-addons']).toEqual(['o-cheese'])
    const removed = toggleOption(added, addonGroup, 'o-cheese')
    expect(removed['g-addons']).toEqual([])
  })

  it('ignores an add that would exceed max_select on a capped multi-select group', () => {
    const full: ModifierSelection = { 'g-dips': ['o-ketchup', 'o-mayo'] }
    const next = toggleOption(full, cappedMultiGroup, 'o-mustard')
    expect(next['g-dips']).toEqual(['o-ketchup', 'o-mayo'])
  })

  it('still allows removing an option when a capped group is at its max', () => {
    const full: ModifierSelection = { 'g-dips': ['o-ketchup', 'o-mayo'] }
    const next = toggleOption(full, cappedMultiGroup, 'o-mayo')
    expect(next['g-dips']).toEqual(['o-ketchup'])
  })
})

// ---- getSelectedOptions -----------------------------------------------------

describe('getSelectedOptions', () => {
  it('returns the selected option objects across all groups in group order', () => {
    const selection: ModifierSelection = {
      'g-size': ['o-large'],
      'g-addons': ['o-cheese', 'o-egg'],
    }
    const options = getSelectedOptions(groups, selection)
    expect(options.map((o) => o.id)).toEqual(['o-large', 'o-cheese', 'o-egg'])
  })

  it('ignores ids that do not exist in the groups', () => {
    const selection: ModifierSelection = { 'g-size': ['does-not-exist'] }
    expect(getSelectedOptions(groups, selection)).toEqual([])
  })
})

// ---- mapSelectionToCartFormat ----------------------------------------------

describe('mapSelectionToCartFormat', () => {
  it('maps single-select groups to selected_variations keyed by group id', () => {
    const selection: ModifierSelection = { 'g-size': ['o-large'] }
    const { selectedVariations } = mapSelectionToCartFormat(groups, selection)
    expect(selectedVariations['g-size'].id).toBe('o-large')
    expect(selectedVariations['g-size'].price_modifier).toBe(20)
  })

  it('maps multi-select group options to add-ons whose price is the option price_modifier', () => {
    const selection: ModifierSelection = { 'g-addons': ['o-cheese', 'o-egg'] }
    const { selectedAddons } = mapSelectionToCartFormat(groups, selection)
    expect(selectedAddons).toEqual([
      { id: 'o-cheese', name: 'Extra Cheese', price: 15 },
      { id: 'o-egg', name: 'Egg', price: 10 },
    ])
  })

  it('omits single-select groups that have no selection', () => {
    const selection: ModifierSelection = { 'g-size': ['o-large'] }
    const { selectedVariations } = mapSelectionToCartFormat(groups, selection)
    expect(selectedVariations['g-spice']).toBeUndefined()
  })

  it('produces a cart subtotal identical to computeModifierSubtotal (pricing parity)', () => {
    const selection: ModifierSelection = {
      'g-size': ['o-large'], // +20
      'g-addons': ['o-cheese', 'o-egg'], // +15 +10
    }
    const basePrice = 100
    const quantity = 2
    const { selectedVariations, selectedAddons } = mapSelectionToCartFormat(groups, selection)

    const cartSubtotal = calculateCartItemSubtotal(
      basePrice,
      selectedVariations,
      selectedAddons,
      quantity,
    )
    const libSubtotal = computeModifierSubtotal(
      basePrice,
      getSelectedOptions(groups, selection),
      quantity,
    )

    expect(cartSubtotal).toBe(libSubtotal)
    expect(cartSubtotal).toBe((100 + 20 + 15 + 10) * 2)
  })
})

// ---- validateAllGroups ------------------------------------------------------

describe('validateAllGroups', () => {
  it('is invalid when a required group has no selection, surfacing that group error', () => {
    const selection: ModifierSelection = { 'g-addons': ['o-cheese'] }
    const result = validateAllGroups(groups, selection)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Size')
  })

  it('is valid when every group satisfies its min/max rules', () => {
    const selection: ModifierSelection = { 'g-size': ['o-large'] }
    const result = validateAllGroups(groups, selection)
    expect(result.valid).toBe(true)
  })

  it('reports the first failing group when several are unmet', () => {
    const twoRequired: ModifierGroup[] = [
      sizeGroup,
      { ...spiceGroup, min_select: 1 },
    ]
    const result = validateAllGroups(twoRequired, {})
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Size')
  })
})
