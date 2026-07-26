/**
 * Phase 4B follow-up — carrying option and addon ids to depletion.
 *
 * Depletion has been base-recipe-only because order items carry `variation` as
 * a comma-joined display string. The ids were never missing from the *cart* —
 * `selected_variations` holds whole option objects — they were just dropped on
 * the way to the order. This extracts them before that happens.
 *
 * Unified modifier options and legacy grouped variations both arrive through
 * `selected_variations`, and the cart cannot tell which recipe target a given
 * option belongs to. Both buckets get the same id set: ids are unique per
 * option, so whichever target exists matches and the other finds nothing.
 */

import { extractSelectionIds } from '@/lib/inventory/order-item-selection'
import type { CartItem } from '@/types/database'

const MENU_ITEM = { id: 'm1', name: 'Pizza' } as CartItem['menu_item']

const cartItem = (over: Partial<CartItem>): CartItem =>
  ({
    id: 'line-1', menu_item: MENU_ITEM, selected_addons: [], quantity: 1, subtotal: 250,
    ...over,
  }) as CartItem

describe('extractSelectionIds', () => {
  it('pulls ids out of grouped variation selections', () => {
    // Arrange
    const item = cartItem({
      selected_variations: {
        'type-size': { id: 'opt-large', name: 'Large', price_modifier: 50 },
        'type-crust': { id: 'opt-thin', name: 'Thin', price_modifier: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    })

    // Act
    const ids = extractSelectionIds(item)

    // Assert
    expect(ids.optionIds).toEqual(expect.arrayContaining(['opt-large', 'opt-thin']))
    expect(ids.optionIds).toHaveLength(2)
  })

  it('pulls the id out of a legacy single variation', () => {
    const item = cartItem({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selected_variation: { id: 'var-small', name: 'Small', price_modifier: 0 } as any,
    })

    expect(extractSelectionIds(item).optionIds).toEqual(['var-small'])
  })

  it('pulls addon ids', () => {
    const item = cartItem({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selected_addons: [{ id: 'add-cheese', name: 'Extra Cheese', price: 15 }] as any,
    })

    expect(extractSelectionIds(item).addonIds).toEqual(['add-cheese'])
  })

  it('returns empty lists for a plain item with no choices', () => {
    expect(extractSelectionIds(cartItem({}))).toEqual({ optionIds: [], addonIds: [] })
  })

  it('skips selections that carry no id rather than emitting undefined', () => {
    // Legacy carts can hold options saved before ids existed. An undefined in
    // the id list would silently match nothing — or worse, everything.
    const item = cartItem({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selected_variations: { 'type-size': { name: 'Large', price_modifier: 50 } } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selected_addons: [{ name: 'Extra Cheese', price: 15 }] as any,
    })

    expect(extractSelectionIds(item)).toEqual({ optionIds: [], addonIds: [] })
  })

  it('prefers the grouped selections when both shapes are present', () => {
    // A cart mid-migration can carry both. The grouped map is the current
    // format and the one the item was actually configured with.
    const item = cartItem({
      selected_variations: {
        'type-size': { id: 'opt-large', name: 'Large', price_modifier: 50 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selected_variation: { id: 'var-stale', name: 'Stale', price_modifier: 0 } as any,
    })

    expect(extractSelectionIds(item).optionIds).toEqual(['opt-large'])
  })
})
