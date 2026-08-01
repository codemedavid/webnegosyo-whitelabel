/**
 * The white-labeled customer app writes its orders straight to the platform
 * `orders` table, so it never passes through `createOrderAction` where
 * depletion is wired. Its orders have therefore been spending nothing at all.
 *
 * The fix deliberately takes NO item data from the caller. A customer has no
 * account, so the route that carries this cannot be authorized the way the
 * merchant app's is; the only safe payload is one with nothing in it to steer.
 * Lines are read back out of the order that was already saved, which is what
 * these rules turn into depletion items.
 */
import { buildDepletionItemsFromOrderRows } from '@/lib/inventory/customer-order-items'

describe('turning a saved order back into depletion items', () => {
  it('spends one line per row, at the quantity the order recorded', () => {
    const items = buildDepletionItemsFromOrderRows([
      { menu_item_id: 'dish-1', quantity: 2 },
      { menu_item_id: 'dish-2', quantity: 1 },
    ])

    expect(items).toEqual([
      { menuItemId: 'dish-1', quantity: 2 },
      { menuItemId: 'dish-2', quantity: 1 },
    ])
  })

  it('keeps two configurations of one dish apart', () => {
    // Merging them would resolve one set of recipes for both, and the whole
    // point of a per-line spend is that a large costs more than a small.
    const items = buildDepletionItemsFromOrderRows([
      { menu_item_id: 'dish-1', quantity: 1 },
      { menu_item_id: 'dish-1', quantity: 3 },
    ])

    expect(items).toHaveLength(2)
    expect(items.map((item) => item.quantity)).toEqual([1, 3])
  })

  it('drops a row with no menu item rather than guessing', () => {
    // A deleted dish leaves the name behind and the id null. Nothing can be
    // spent for it, and inventing an id would spend someone else's stock.
    const items = buildDepletionItemsFromOrderRows([
      { menu_item_id: null, quantity: 2 },
      { menu_item_id: 'dish-1', quantity: 1 },
    ])

    expect(items).toEqual([{ menuItemId: 'dish-1', quantity: 1 }])
  })

  it('drops a row with no usable quantity', () => {
    const items = buildDepletionItemsFromOrderRows([
      { menu_item_id: 'dish-1', quantity: 0 },
      { menu_item_id: 'dish-2', quantity: -1 },
      { menu_item_id: 'dish-3', quantity: Number.NaN },
    ])

    expect(items).toEqual([])
  })

  it('carries no option ids, because the order never stored any', () => {
    // Web checkout resolves ids in flight and drops them; nothing persists them
    // on the order. Reading them back is impossible, and accepting them FROM the
    // caller is what this design refuses. Base recipes deplete; option-level
    // spend on this path waits for the ids to be stored.
    const [item] = buildDepletionItemsFromOrderRows([
      { menu_item_id: 'dish-1', quantity: 1 },
    ])

    expect(item.optionIds).toBeUndefined()
    expect(item.addonIds).toBeUndefined()
  })
})
