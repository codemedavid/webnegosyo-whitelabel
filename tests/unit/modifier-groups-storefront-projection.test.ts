import { TENANT_STOREFRONT_SELECT } from '@/lib/queries/tenant-storefront-select'
import { PRODUCT_DETAIL_TENANT_SELECT } from '@/lib/queries/product-detail-tenant-select'
import {
  MENU_ITEM_DETAIL_SELECT,
  MENU_ITEM_LIST_SELECT,
} from '@/lib/queries/menu-item-select'

/**
 * Multi-select modifier groups (min/max picks) were fully implemented — model,
 * adapter, hook, selector, admin editor — but never reached a single storefront
 * visitor, because two projections dropped the columns the feature reads:
 *
 *  - the tenant queries never selected `modifier_groups_enabled`, so the flag
 *    resolved to `undefined` → `false` and the gate closed on every tenant;
 *  - the menu-item queries never selected `modifier_groups`, so the payload was
 *    always `undefined` and `useModifierGroups().active` was permanently false.
 *
 * Same class of silent-fallback bug as the hero-color drift pinned in
 * `tenant-storefront-select.test.ts`. These assertions fail loudly if either
 * column is dropped again.
 */

function tokensOf(projection: string): string[] {
  return projection.split(/[\s,]+/).filter(Boolean)
}

describe('tenant projections expose the modifier-groups feature flag', () => {
  it('selects modifier_groups_enabled on the menu page', () => {
    expect(tokensOf(TENANT_STOREFRONT_SELECT)).toContain('modifier_groups_enabled')
  })

  it('selects modifier_groups_enabled on the product detail page', () => {
    expect(tokensOf(PRODUCT_DETAIL_TENANT_SELECT)).toContain('modifier_groups_enabled')
  })
})

describe('menu item projections expose the modifier_groups payload', () => {
  it('selects modifier_groups for the product detail fetch', () => {
    expect(tokensOf(MENU_ITEM_DETAIL_SELECT)).toContain('modifier_groups')
  })

  it('selects modifier_groups for the menu list fetch (quick-view sheet)', () => {
    expect(tokensOf(MENU_ITEM_LIST_SELECT)).toContain('modifier_groups')
  })

  it('still selects the legacy variation columns both paths fall back to', () => {
    for (const projection of [MENU_ITEM_DETAIL_SELECT, MENU_ITEM_LIST_SELECT]) {
      const tokens = tokensOf(projection)
      expect(tokens).toContain('variations')
      expect(tokens).toContain('variation_types')
      expect(tokens).toContain('addons')
    }
  })

  it('keeps the columns the menu grid renders in the list projection', () => {
    const tokens = tokensOf(MENU_ITEM_LIST_SELECT)
    for (const column of [
      'id',
      'tenant_id',
      'category_id',
      'name',
      'description',
      'price',
      'discounted_price',
      'image_url',
      'is_available',
      'is_featured',
      'order',
      'bcg_classification',
      'badge_text',
    ]) {
      expect(tokens).toContain(column)
    }
  })
})
