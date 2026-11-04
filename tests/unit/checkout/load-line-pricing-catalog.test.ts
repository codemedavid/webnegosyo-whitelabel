/**
 * Server pricing must see the dish exactly as the storefront / app showed it,
 * because the customer app sends every line at price 0 and the web's own price
 * claim can be forged low. Two gaps closed here:
 *
 *  1. Category default add-ons (`categories.default_addons`) are merged into a
 *     legacy-path dish's add-ons with the storefront's rule (item wins on a
 *     case-insensitive name clash) — and NOT on the unified `modifier_groups`
 *     path, which never shows them.
 *  2. Linked options (`menu_item_id` on an option) are priced at the BRANCH
 *     price of the linked dish, read in the same override query as the cart's
 *     own dishes.
 */

import { describe, test, expect, jest, afterEach } from '@jest/globals'
import { loadAndPriceOrderLines } from '@/lib/checkout/load-line-pricing'
import type { PriceableOrderLine } from '@/lib/checkout/price-order-lines'
import { fakeSupabaseTables } from '../../fixtures/fake-supabase-tables'

const TENANT = 'tenant-1'
const OUTLET = 'outlet-1'

const LEGACY_STORE = { modifierGroupsEnabled: false }
const UNIFIED_STORE = { modifierGroupsEnabled: true }

const line = (over: Partial<PriceableOrderLine> = {}): PriceableOrderLine => ({
  menu_item_id: 'burger', menu_item_name: 'Burger', price: 0, subtotal: 0, quantity: 1, ...over,
})

const burger = (over: Record<string, unknown> = {}) => ({
  id: 'burger', tenant_id: TENANT, name: 'Burger', category_id: 'cat-food', price: 100, discounted_price: null,
  is_available: true, variation_types: [], variations: [], addons: [{ id: 'own-cheese', name: 'Cheese', price: 10 }],
  ...over,
})

const foodCategory = (defaults: unknown[], over: Record<string, unknown> = {}) => ({
  id: 'cat-food', tenant_id: TENANT, name: 'Food', default_addons: defaults, ...over,
})

const EGG = { id: 'cat-egg', name: 'Fried egg', price: 15 }
const CAT_CHEESE = { id: 'cat-cheese', name: 'cheese', price: 5 }

const unifiedGroups = (options: unknown[]) => [{ id: 'g1', name: 'Extras', selection_mode: 'quantity', options }]

const override = (menuItemId: string, over: Record<string, unknown> = {}) => ({
  id: `ovr-${menuItemId}`, tenant_id: TENANT, outlet_id: OUTLET, menu_item_id: menuItemId,
  is_listed: true, is_available: true, price: null, discounted_price: null, discount_cleared: false,
  created_at: '', updated_at: '', ...over,
})

const priceOf = (result: Awaited<ReturnType<typeof loadAndPriceOrderLines>>): number => {
  if (!result.ok) throw new Error(result.error)
  return result.lines[0].price
}

afterEach(() => { jest.restoreAllMocks() })

describe('category default add-ons', () => {
  test('a default add-on claimed by id at price 0 is charged its price', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({ menu_items: [burger()], categories: [foodCategory([EGG])] })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [line({ addon_ids: ['cat-egg'], addons: ['Fried egg'] })], null, LEGACY_STORE)

    // Assert
    expect(priceOf(result)).toBe(115)
  })

  test('a default add-on named only on the ticket is still charged', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({ menu_items: [burger()], categories: [foodCategory([EGG])] })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [line({ addons: ['Fried egg ×2'] })], null, LEGACY_STORE)

    // Assert
    expect(priceOf(result)).toBe(130)
  })

  test('the dish’s own add-on wins over a default of the same name, whatever the case', async () => {
    // Arrange — the category's ₱5 "cheese" is hidden behind the dish's ₱10 "Cheese".
    const { client } = fakeSupabaseTables({ menu_items: [burger()], categories: [foodCategory([CAT_CHEESE])] })
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    // Act — a forged claim of the hidden default's id, ticket reading "cheese".
    const result = await loadAndPriceOrderLines(client, TENANT, [line({ addon_ids: ['cat-cheese'], addons: ['cheese'] })], null, LEGACY_STORE)

    // Assert — the ticket's cheese is the dish's ₱10 one, never the hidden ₱5.
    expect(priceOf(result)).toBe(110)
  })

  test('defaults are not offered on the unified modifier-groups path', async () => {
    // Arrange
    const dish = burger({ modifier_groups: unifiedGroups([{ id: 'o-bacon', name: 'Bacon', price_modifier: 20 }]) })
    const tables = { menu_items: [dish], categories: [foodCategory([EGG])] }
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const claim = line({ addon_ids: ['cat-egg'] })

    // Act
    const unified = fakeSupabaseTables(tables)
    const legacy = fakeSupabaseTables(tables)
    const onUnified = await loadAndPriceOrderLines(unified.client, TENANT, [claim], null, UNIFIED_STORE)
    const onLegacy = await loadAndPriceOrderLines(legacy.client, TENANT, [claim], null, LEGACY_STORE)

    // Assert — the flag decides, exactly as modifierGroupsFor decides.
    expect(priceOf(onUnified)).toBe(100)
    expect(unified.seen).not.toContain('categories')
    expect(priceOf(onLegacy)).toBe(115)
  })

  test('a unified dish sharing a category with a legacy dish still gets no defaults', async () => {
    // Arrange — the legacy dish makes the category read happen; the unified one must ignore it.
    const unifiedDish = burger({
      id: 'wrap', name: 'Wrap', addons: [],
      modifier_groups: unifiedGroups([{ id: 'o-bacon', name: 'Bacon', price_modifier: 20 }]),
    })
    const { client } = fakeSupabaseTables({ menu_items: [burger(), unifiedDish], categories: [foodCategory([EGG])] })
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [
      line({ addon_ids: ['cat-egg'] }),
      line({ menu_item_id: 'wrap', menu_item_name: 'Wrap', addon_ids: ['cat-egg'] }),
    ], null, UNIFIED_STORE)

    // Assert
    if (!result.ok) throw new Error(result.error)
    expect(result.lines.map((priced) => priced.price)).toEqual([115, 100])
  })

  test('reads only this store’s categories, and only those of the cart’s dishes, in one query', async () => {
    // Arrange — another store's category with the same id must not leak in.
    const { client, seen } = fakeSupabaseTables({
      menu_items: [burger(), burger({ id: 'fries', name: 'Fries', category_id: 'cat-sides', addons: [] })],
      categories: [
        foodCategory([{ id: 'foreign', name: 'Gold leaf', price: 999 }], { tenant_id: 'other-tenant' }),
        foodCategory([EGG]),
        { id: 'cat-sides', tenant_id: TENANT, name: 'Sides', default_addons: [{ id: 'dip', name: 'Dip', price: 7 }] },
        { id: 'cat-drinks', tenant_id: TENANT, name: 'Drinks', default_addons: [{ id: 'ice', name: 'Ice', price: 1 }] },
      ],
    })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [
      line({ addons: ['Fried egg'] }),
      line({ menu_item_id: 'fries', menu_item_name: 'Fries', addon_ids: ['dip'], addons: ['Dip'] }),
    ], null, LEGACY_STORE)

    // Assert
    if (!result.ok) throw new Error(result.error)
    expect(result.lines.map((priced) => priced.price)).toEqual([115, 107])
    expect(seen.filter((table) => table === 'categories')).toHaveLength(1)
  })

  test('a failed category read is an infrastructure failure, never a free add-on', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({ menu_items: [burger()] }, { categories: 'down' })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [line({ addons: ['Fried egg'] })], null, LEGACY_STORE)

    // Assert
    expect(result).toEqual({ ok: false, refused: false, error: 'Failed to verify add-on prices' })
  })

  test('tolerates malformed default add-on JSON without losing the order', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({
      menu_items: [burger({ addons: null })],
      categories: [foodCategory([null, 'junk', { id: 7 }, { id: 'nameless', price: 3 }, EGG])],
    })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [line({ addon_ids: ['cat-egg'] })], null, LEGACY_STORE)

    // Assert
    expect(priceOf(result)).toBe(115)
  })
})

describe('linked options at a branch', () => {
  const linkedDish = (over: Record<string, unknown> = {}) => ({
    id: 'soda', tenant_id: TENANT, name: 'Soda', category_id: 'cat-drinks', price: 40, discounted_price: null,
    is_available: true, ...over,
  })
  const withLinkedSoda = () => burger({
    addons: [],
    modifier_groups: unifiedGroups([{ id: 'o-soda', name: '', price_modifier: 0, menu_item_id: 'soda' }]),
  })
  const sodaLine = () => line({ addon_ids: ['o-soda'], addons: ['Soda'] })

  test('takes the branch’s price for the linked dish', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({
      menu_items: [withLinkedSoda(), linkedDish()],
      outlet_menu_items: [override('soda', { price: 55 })],
    })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [sodaLine()], OUTLET, UNIFIED_STORE)

    // Assert
    expect(priceOf(result)).toBe(155)
  })

  test('a branch that declines the store-wide sale charges the list price', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({
      menu_items: [withLinkedSoda(), linkedDish({ discounted_price: 30 })],
      outlet_menu_items: [override('soda', { discount_cleared: true })],
    })

    // Act
    const atBranch = await loadAndPriceOrderLines(client, TENANT, [sodaLine()], OUTLET, UNIFIED_STORE)
    const storeWide = await loadAndPriceOrderLines(client, TENANT, [sodaLine()], null, UNIFIED_STORE)

    // Assert
    expect(priceOf(atBranch)).toBe(140)
    expect(priceOf(storeWide)).toBe(130)
  })

  test('another branch’s override does not apply', async () => {
    // Arrange
    const { client } = fakeSupabaseTables({
      menu_items: [withLinkedSoda(), linkedDish()],
      outlet_menu_items: [override('soda', { outlet_id: 'outlet-2', price: 5 })],
    })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [sodaLine()], OUTLET, UNIFIED_STORE)

    // Assert
    expect(priceOf(result)).toBe(140)
  })

  test('the cart’s dishes and the linked dishes share ONE override read', async () => {
    // Arrange
    const { client, seen } = fakeSupabaseTables({
      menu_items: [withLinkedSoda(), linkedDish()],
      outlet_menu_items: [override('burger', { price: 90 }), override('soda', { price: 50 })],
    })

    // Act
    const result = await loadAndPriceOrderLines(client, TENANT, [sodaLine()], OUTLET, UNIFIED_STORE)

    // Assert
    expect(priceOf(result)).toBe(140)
    expect(seen.filter((table) => table === 'outlet_menu_items')).toHaveLength(1)
  })
})

describe('query count', () => {
  test('a unified store-wide cart adds no read', async () => {
    // Arrange
    const dish = burger({ modifier_groups: unifiedGroups([{ id: 'o-bacon', name: 'Bacon', price_modifier: 20 }]) })
    const { client, seen } = fakeSupabaseTables({ menu_items: [dish], categories: [foodCategory([EGG])] })

    // Act
    await loadAndPriceOrderLines(client, TENANT, [line({ addon_ids: ['o-bacon'] })], null, UNIFIED_STORE)

    // Assert
    expect(seen).toEqual(['menu_items'])
  })

  test('a legacy branch cart adds exactly one read (its categories)', async () => {
    // Arrange
    const { client, seen } = fakeSupabaseTables({ menu_items: [burger()], categories: [foodCategory([EGG])], outlet_menu_items: [] })

    // Act
    await loadAndPriceOrderLines(client, TENANT, [line()], OUTLET, LEGACY_STORE)

    // Assert
    expect([...seen].sort()).toEqual(['categories', 'menu_items', 'outlet_menu_items'])
  })
})
