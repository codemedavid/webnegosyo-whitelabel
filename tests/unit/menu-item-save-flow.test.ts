/**
 * What happens the moment a menu item is saved.
 *
 * Creating a dish used to end by silently closing back to the menu list — the
 * one moment a merchant is thinking about this dish, thrown away. On a tenant
 * with inventory on, a dish with no recipe deducts nothing when it sells, so
 * the create flow must hand the merchant straight to the recipe step instead
 * of hoping they rediscover it at the bottom of the edit form.
 */

import { resolvePostSaveStep } from '@/lib/menu-item-save-flow'

const NEW_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('resolvePostSaveStep', () => {
  it('sends a freshly created dish into the recipe step when inventory is on', () => {
    const step = resolvePostSaveStep({
      isNewItem: true,
      inventoryEnabled: true,
      savedItemId: NEW_ID,
    })

    expect(step).toEqual({ kind: 'link-ingredients', itemId: NEW_ID })
  })

  it('returns to the menu when the tenant has no inventory', () => {
    const step = resolvePostSaveStep({
      isNewItem: true,
      inventoryEnabled: false,
      savedItemId: NEW_ID,
    })

    expect(step).toEqual({ kind: 'return-to-menu' })
  })

  it('returns to the menu after editing an existing dish — its form already shows the recipe editor', () => {
    const step = resolvePostSaveStep({
      isNewItem: false,
      inventoryEnabled: true,
      savedItemId: NEW_ID,
    })

    expect(step).toEqual({ kind: 'return-to-menu' })
  })

  it('returns to the menu when the save came back without an id to attach a recipe to', () => {
    const step = resolvePostSaveStep({
      isNewItem: true,
      inventoryEnabled: true,
      savedItemId: undefined,
    })

    expect(step).toEqual({ kind: 'return-to-menu' })
  })
})
