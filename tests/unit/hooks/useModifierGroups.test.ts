/**
 * Phase 2 (storefront) — hook that drives the unified modifier-groups selection
 * UI on the product detail page. Thin React glue over the pure adapter in
 * `@/lib/modifier-groups-cart`; the arithmetic lives (and is tested) there.
 */

import { act, renderHook } from '@testing-library/react'
import type { MenuItem, ModifierGroup } from '@/types/database'
import { useModifierGroups } from '@/hooks/useModifierGroups'

const groups: ModifierGroup[] = [
  {
    id: 'g-size',
    name: 'Size',
    display_order: 0,
    min_select: 1,
    max_select: 1,
    options: [
      { id: 'o-small', name: 'Small', price_modifier: 0, display_order: 0 },
      { id: 'o-large', name: 'Large', price_modifier: 20, display_order: 1, is_default: true },
    ],
  },
  {
    id: 'g-addons',
    name: 'Add-ons',
    display_order: 1,
    min_select: 0,
    max_select: null,
    options: [
      { id: 'o-cheese', name: 'Extra Cheese', price_modifier: 15, display_order: 0 },
      { id: 'o-egg', name: 'Egg', price_modifier: 10, display_order: 1 },
    ],
  },
]

function makeItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item-1',
    price: 100,
    variations: [],
    addons: [],
    modifier_groups: groups,
    ...overrides,
  } as MenuItem
}

describe('useModifierGroups', () => {
  it('is inactive for an item with no modifier_groups', () => {
    const item = makeItem({ modifier_groups: [] })
    const { result } = renderHook(() => useModifierGroups({ item }))
    expect(result.current.active).toBe(false)
    expect(result.current.groups).toEqual([])
  })

  it('is active and seeds the default selection for a modifier-groups item', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    expect(result.current.active).toBe(true)
    // Size defaults to Large (is_default); optional add-ons start empty.
    expect(result.current.selection['g-size']).toEqual(['o-large'])
    expect(result.current.selection['g-addons']).toEqual([])
  })

  it('computes total price from the default selection (base + defaults) × qty', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    // 100 base + 20 (Large) × qty 1
    expect(result.current.totalPrice).toBe(120)
  })

  it('uses the discounted price as the base when present', () => {
    const item = makeItem({ discounted_price: 80 })
    const { result } = renderHook(() => useModifierGroups({ item }))
    expect(result.current.totalPrice).toBe(100) // 80 + 20
  })

  it('toggles a multi-select add-on and reflects it in the price', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    act(() => result.current.toggle(groups[1], 'o-cheese'))
    expect(result.current.selection['g-addons']).toEqual(['o-cheese'])
    expect(result.current.totalPrice).toBe(135) // 100 + 20 + 15
  })

  it('replaces the single-select choice when a different size is toggled', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    act(() => result.current.toggle(groups[0], 'o-small'))
    expect(result.current.selection['g-size']).toEqual(['o-small'])
    expect(result.current.totalPrice).toBe(100) // 100 + 0
  })

  it('exposes the cart-format projection for add-to-cart', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    act(() => result.current.toggle(groups[1], 'o-egg'))
    const { selectedVariations, selectedAddons } = result.current.cartFormat
    expect(selectedVariations['g-size'].id).toBe('o-large')
    expect(selectedAddons).toEqual([{ id: 'o-egg', name: 'Egg', price: 10 }])
  })

  it('validates required groups: valid by default, invalid once cleared', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    expect(result.current.validate().valid).toBe(true)
    act(() => result.current.toggle(groups[0], 'o-large')) // clears the single-select
    const invalid = result.current.validate()
    expect(invalid.valid).toBe(false)
    expect(invalid.error).toContain('Size')
  })

  it('clamps quantity within [1, 99] via increment/decrement', () => {
    const { result } = renderHook(() => useModifierGroups({ item: makeItem() }))
    act(() => result.current.decrementQuantity())
    expect(result.current.quantity).toBe(1)
    act(() => result.current.incrementQuantity())
    expect(result.current.quantity).toBe(2)
    expect(result.current.totalPrice).toBe(240) // (100 + 20) × 2
  })
})

/**
 * The "pick any 2 of 4" journey the web could not express before: a bounded
 * multi-select group (min 2, max 3). Exercised through the hook because that is
 * what the storefront actually drives — the adapter's rules are unit-tested in
 * `modifier-groups-cart.test.ts`, but nothing covered them via the React seam
 * that add-to-cart calls.
 */
const pickTwoToThree: ModifierGroup[] = [
  {
    id: 'g-toppings',
    name: 'Toppings',
    display_order: 0,
    min_select: 2,
    max_select: 3,
    options: [
      { id: 'o-ham', name: 'Ham', price_modifier: 10, display_order: 0 },
      { id: 'o-corn', name: 'Corn', price_modifier: 5, display_order: 1 },
      { id: 'o-olive', name: 'Olive', price_modifier: 8, display_order: 2 },
      { id: 'o-basil', name: 'Basil', price_modifier: 6, display_order: 3 },
    ],
  },
]

describe('useModifierGroups — bounded multi-select (choose 2 to 3)', () => {
  function renderBounded() {
    const item = makeItem({ modifier_groups: pickTwoToThree })
    return renderHook(() => useModifierGroups({ item }))
  }

  const group = pickTwoToThree[0]

  it('starts empty when no option is flagged as a default', () => {
    const { result } = renderBounded()
    expect(result.current.selection['g-toppings']).toEqual([])
  })

  it('blocks add-to-cart until the minimum is met', () => {
    const { result } = renderBounded()

    expect(result.current.validate().valid).toBe(false)

    act(() => result.current.toggle(group, 'o-ham'))
    expect(result.current.validate().valid).toBe(false)

    act(() => result.current.toggle(group, 'o-corn'))
    expect(result.current.validate().valid).toBe(true)
  })

  it('names the group in the error so the shopper knows what to fix', () => {
    const { result } = renderBounded()
    expect(result.current.validate().error).toContain('Toppings')
  })

  it('accumulates picks rather than replacing them, and prices them together', () => {
    const { result } = renderBounded()

    act(() => result.current.toggle(group, 'o-ham'))
    act(() => result.current.toggle(group, 'o-corn'))

    expect(result.current.selection['g-toppings']).toEqual(['o-ham', 'o-corn'])
    expect(result.current.totalPrice).toBe(115) // 100 base + 10 + 5
  })

  it('refuses a fourth pick once the cap of 3 is reached', () => {
    const { result } = renderBounded()

    for (const id of ['o-ham', 'o-corn', 'o-olive', 'o-basil']) {
      act(() => result.current.toggle(group, id))
    }

    expect(result.current.selection['g-toppings']).toEqual(['o-ham', 'o-corn', 'o-olive'])
    expect(result.current.validate().valid).toBe(true)
  })

  it('lets the shopper swap a pick out at the cap', () => {
    const { result } = renderBounded()

    for (const id of ['o-ham', 'o-corn', 'o-olive']) {
      act(() => result.current.toggle(group, id))
    }
    act(() => result.current.toggle(group, 'o-ham')) // remove
    act(() => result.current.toggle(group, 'o-basil')) // now fits

    expect(result.current.selection['g-toppings']).toEqual(['o-corn', 'o-olive', 'o-basil'])
  })

  it('carries every pick into the cart as a priced add-on', () => {
    const { result } = renderBounded()

    act(() => result.current.toggle(group, 'o-ham'))
    act(() => result.current.toggle(group, 'o-corn'))

    const { selectedAddons, selectedVariations } = result.current.cartFormat
    expect(selectedAddons.map((a) => a.name)).toEqual(['Ham', 'Corn'])
    expect(selectedAddons.map((a) => a.price)).toEqual([10, 5])
    // Multi-select groups never collapse into the single-variation slot.
    expect(selectedVariations).toEqual({})
  })
})
