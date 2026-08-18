/**
 * Which dishes are actually linked to inventory.
 *
 * A menu item with no recipe deducts nothing when it sells, and the live
 * platform has stores where that is true of every dish. The menu list needs a
 * cheap answer — one query, an id set — so it can mark the dishes whose sales
 * silently move no stock.
 */

import { collectLinkedMenuItemIds } from '@/lib/inventory/recipe-link'

const DISH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DISH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('collectLinkedMenuItemIds', () => {
  it('collects the dishes whose base recipe lists at least one ingredient', () => {
    const linked = collectLinkedMenuItemIds([
      { recipes: { menu_item_id: DISH_A, target_type: 'menu_item' } },
      { recipes: { menu_item_id: DISH_A, target_type: 'menu_item' } },
      { recipes: { menu_item_id: DISH_B, target_type: 'menu_item' } },
    ])

    expect(linked).toEqual([DISH_A, DISH_B])
  })

  it('does not count an addon or prep recipe as linking the dish', () => {
    // The same rule auto-86 and coverage use: only a `menu_item` recipe makes
    // the dish itself depletable.
    const linked = collectLinkedMenuItemIds([
      { recipes: { menu_item_id: DISH_A, target_type: 'addon' } },
      { recipes: { menu_item_id: null, target_type: 'prep_item' } },
    ])

    expect(linked).toEqual([])
  })

  it('survives rows whose recipe join came back empty', () => {
    const linked = collectLinkedMenuItemIds([
      { recipes: null },
      { recipes: { menu_item_id: DISH_B, target_type: 'menu_item' } },
    ])

    expect(linked).toEqual([DISH_B])
  })
})
