import { appCatalogSchema } from '@/lib/app-contract'
import type { Category, OrderType, Outlet } from '@/types/database'
import { createTestAddon, createTestMenuItem, createTestVariation } from '../../fixtures/menu-item.fixture'

describe('projectAppCatalog', () => {
  const load = async () => (await import('@/lib/app-api/project-catalog')).projectAppCatalog

  const category = (overrides: Partial<Category> = {}): Category => ({
    id: 'cat-1',
    tenant_id: 't',
    name: 'Coffee',
    order: 0,
    is_active: true,
    display_layout: 'grid',
    created_at: '',
    updated_at: '',
    ...overrides,
  })

  const orderType = (overrides: Partial<OrderType>): OrderType =>
    ({ id: 'ot-pickup', tenant_id: 't', type: 'pickup', name: 'Pick Up', is_enabled: true, available_on_web: true, order_index: 0, ...overrides }) as OrderType

  const base = (overrides: Record<string, unknown> = {}) => ({
    tenant: {},
    categories: [category()],
    menuItems: [createTestMenuItem({ id: 'latte', category_id: 'cat-1', name: 'Latte', image_url: 'https://cdn.example.com/latte.jpg' })],
    orderTypes: [orderType({})],
    outlets: [] as Outlet[],
    outletOverrides: [],
    outletId: null,
    paymentMethods: [],
    pairs: [],
    ...overrides,
  })

  it('produces a contract-valid catalog', async () => {
    const projectAppCatalog = await load()
    const catalog = projectAppCatalog(base())
    const parsed = appCatalogSchema.safeParse(catalog)
    expect(parsed.success ? null : parsed.error.issues).toBeNull()
    expect(catalog.items[0]).toMatchObject({ id: 'latte', categoryId: 'cat-1', price: 100, compareAtPrice: null, isAvailable: true })
  })

  it('charges the sale price and strikes the list price through', async () => {
    const projectAppCatalog = await load()
    const items = [createTestMenuItem({ id: 'a', category_id: 'cat-1', price: 120, discounted_price: 99 })]
    expect(projectAppCatalog(base({ menuItems: items })).items[0]).toMatchObject({ price: 99, compareAtPrice: 120 })
  })

  it('keeps sold-out dishes listed but unavailable, drops non-https images and presell dishes', async () => {
    const projectAppCatalog = await load()
    const items = [
      createTestMenuItem({ id: 'out', category_id: 'cat-1', is_available: false, image_url: 'http://x.example.com/a.jpg' }),
      createTestMenuItem({ id: 'presell', category_id: 'cat-1', presell_enabled: true }),
    ]
    const catalog = projectAppCatalog(base({ menuItems: items }))
    expect(catalog.items.map((item) => item.id)).toEqual(['out'])
    expect(catalog.items[0]).toMatchObject({ isAvailable: false, imageUrl: null })
  })

  it('omits categories with no dishes and items of inactive categories', async () => {
    const projectAppCatalog = await load()
    const catalog = projectAppCatalog(base({ categories: [category(), category({ id: 'empty', name: 'Empty' })] }))
    expect(catalog.categories.map((c) => c.id)).toEqual(['cat-1'])
  })

  it('turns legacy variations and add-ons into choice and quantity groups', async () => {
    const projectAppCatalog = await load()
    const items = [
      createTestMenuItem({
        id: 'a',
        category_id: 'cat-1',
        variations: [createTestVariation({ id: 'reg', name: 'Regular', price_modifier: 0 }), createTestVariation({ id: 'lg', name: 'Large', price_modifier: 20 })],
        addons: [createTestAddon({ id: 'shot', name: 'Extra shot', price: 35 })],
      }),
    ]
    const groups = projectAppCatalog(base({ menuItems: items })).items[0].modifierGroups
    expect(groups.map((g) => [g.id, g.selectionMode, g.minSelect, g.maxSelect])).toEqual([
      ['legacy-variations', 'choice', 0, 1],
      ['legacy-addons', 'quantity', 0, null],
    ])
    expect(groups[0].options.map((o) => [o.id, o.priceDelta])).toEqual([['reg', 0], ['lg', 20]])
  })

  it('merges a category default add-on unless the dish has one of the same name', async () => {
    const projectAppCatalog = await load()
    const categories = [category({ default_addons: [createTestAddon({ id: 'rice', name: 'Rice', price: 20 }), createTestAddon({ id: 'cat-shot', name: 'extra SHOT', price: 40 })] })]
    const items = [createTestMenuItem({ id: 'a', category_id: 'cat-1', addons: [createTestAddon({ id: 'shot', name: 'Extra shot', price: 35 })] })]
    const options = projectAppCatalog(base({ categories, menuItems: items })).items[0].modifierGroups[0].options
    expect(options.map((o) => o.id)).toEqual(['shot', 'rice'])
  })

  it('applies the chosen branch: unlisted dishes vanish, branch prices win', async () => {
    const projectAppCatalog = await load()
    const items = [createTestMenuItem({ id: 'a', category_id: 'cat-1', price: 100 }), createTestMenuItem({ id: 'b', category_id: 'cat-1', price: 50 })]
    const outletOverrides = [
      { outlet_id: 'o1', menu_item_id: 'a', price: 110, discounted_price: null, discount_cleared: false, is_available: true, is_listed: true },
      { outlet_id: 'o1', menu_item_id: 'b', price: null, discounted_price: null, discount_cleared: false, is_available: true, is_listed: false },
    ]
    const catalog = projectAppCatalog(base({ menuItems: items, outletOverrides, outletId: 'o1' }))
    expect(catalog.items.map((item) => [item.id, item.price])).toEqual([['a', 110]])
  })

  it('maps order types, keeping only kinds the app knows', async () => {
    const projectAppCatalog = await load()
    const orderTypes = [orderType({ minimum_order_amount: '300' as unknown as number, id: 'ot-d', type: 'delivery', name: 'Delivery' }), orderType({ id: 'ot-x', type: 'weird' as OrderType['type'] })]
    expect(projectAppCatalog(base({ orderTypes })).orderTypes).toEqual([{ id: 'ot-d', kind: 'delivery', name: 'Delivery', minimumOrder: 300 }])
  })

  it('maps payment methods with their order types; cash only when no details or proof are asked', async () => {
    const projectAppCatalog = await load()
    const paymentMethods = [
      { id: 'cash', name: 'Cash', skip_payment_details: true, require_payment_proof: false, payment_method_order_types: [] },
      { id: 'gcash', name: 'GCash', details: 'Send to 0917 000 0000', require_payment_proof: true, payment_method_order_types: [{ order_type_id: 'ot-pickup' }, { order_type_id: null }] },
    ]
    expect(projectAppCatalog(base({ paymentMethods })).paymentMethods).toEqual([
      { id: 'cash', name: 'Cash', kind: 'cash', instructions: null, requiresProof: false, orderTypeIds: [] },
      { id: 'gcash', name: 'GCash', kind: 'manual', instructions: 'Send to 0917 000 0000', requiresProof: true, orderTypeIds: ['ot-pickup'] },
    ])
  })

  it('groups complementary pairs by source, in display order, only between dishes on the menu', async () => {
    const projectAppCatalog = await load()
    const items = ['a', 'b', 'c'].map((id) => createTestMenuItem({ id, category_id: 'cat-1' }))
    const pairs = [
      { source_item_id: 'a', target_item_id: 'c', display_order: 2 },
      { source_item_id: 'a', target_item_id: 'b', display_order: 1 },
      { source_item_id: 'a', target_item_id: 'gone', display_order: 0 },
      { source_item_id: 'gone', target_item_id: 'b', display_order: 0 },
    ]
    expect(projectAppCatalog(base({ menuItems: items, pairs })).pairings).toEqual([{ sourceItemId: 'a', targetItemIds: ['b', 'c'] }])
  })

  it('shows badges only when the store has menu engineering on', async () => {
    const projectAppCatalog = await load()
    const items = [createTestMenuItem({ id: 'a', category_id: 'cat-1', badge_text: 'Best seller' })]
    expect(projectAppCatalog(base({ menuItems: items })).items[0].badge).toBeNull()
    expect(projectAppCatalog(base({ menuItems: items, tenant: { menu_engineering_enabled: true } })).items[0].badge).toBe('Best seller')
  })

  it('versions the catalog by its content', async () => {
    const projectAppCatalog = await load()
    const first = projectAppCatalog(base()).version
    expect(projectAppCatalog(base()).version).toBe(first)
    const changed = [createTestMenuItem({ id: 'latte', category_id: 'cat-1', price: 101 })]
    expect(projectAppCatalog(base({ menuItems: changed })).version).not.toBe(first)
  })
})
