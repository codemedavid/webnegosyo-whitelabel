/**
 * Line pricing used to read the dishes, then the linked add-on dishes, then
 * the branch's price overrides, then the combos — four sequential round trips
 * on the path of every branch or combo order. Now it is at most two rounds:
 * the combo catalog (keyed by the cart alone) rides alongside the dish read;
 * everything the dish rows name — the linked add-on dishes, the categories of
 * legacy-path dishes, and the branch overrides for the dishes AND their linked
 * dishes (one query, so linked options take the branch's price) — goes out
 * together in the second round.
 *
 * Parallel reads must not change which failure the checkout hears: the
 * messages keep their old precedence (dishes, add-ons, branch, combos).
 */

import { describe, test, expect } from '@jest/globals'
import { loadAndPriceOrderLines, type LinePricingClient } from '@/lib/checkout/load-line-pricing'
import type { PriceableOrderLine } from '@/lib/checkout/price-order-lines'

interface Deferred {
  table: string
  resolve: (value: { data: unknown; error: unknown }) => void
}

/** A client whose reads stay pending until the test settles them. */
function deferredClient() {
  const pending: Deferred[] = []
  const client: LinePricingClient = {
    from: (table: string) => {
      const promise = new Promise<{ data: unknown; error: unknown }>((resolve) => {
        pending.push({ table, resolve })
      })
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        maybeSingle: () => promise,
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          promise.then(onFulfilled, onRejected),
      }
      return chain
    },
  }
  return { client, pending }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const STORE = { modifierGroupsEnabled: false }

const linkedBurger = {
  id: 'burger', name: 'Burger', category_id: 'cat-food', price: 100, is_available: true,
  modifier_groups: [{ id: 'g', name: 'Drink', options: [{ id: 'o-soda', name: '', price_modifier: 0, menu_item_id: 'soda' }] }],
}

const plainLine: PriceableOrderLine = {
  menu_item_id: 'burger', menu_item_name: 'Burger', price: 100, subtotal: 100, quantity: 1,
}

describe('loadAndPriceOrderLines — independent reads run together', () => {
  test('issues the linked, category and branch reads together once the dishes are known', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1', STORE)
    await flush()

    // Assert — round one is the dish read alone.
    expect(pending.map((read) => read.table)).toEqual(['menu_items'])
    pending[0].resolve({ data: [linkedBurger], error: null })
    await flush()

    // Round two: all three in flight before any answered.
    expect(pending.slice(1).map((read) => read.table).sort()).toEqual(['categories', 'menu_items', 'outlet_menu_items'])
    pending[1].resolve({ data: [{ id: 'soda', name: 'Soda', price: 40 }], error: null })
    pending.find((read) => read.table === 'categories')!.resolve({ data: [], error: null })
    pending.find((read) => read.table === 'outlet_menu_items')!.resolve({ data: [], error: null })
    await expect(result).resolves.toMatchObject({ ok: true, itemsSubtotal: 100 })
  })

  test('starts the combo reads alongside the dish read', async () => {
    // Arrange
    const { client, pending } = deferredClient()
    const comboLine: PriceableOrderLine = { ...plainLine, isBundleItem: true, bundleId: 'combo' }

    // Act
    void loadAndPriceOrderLines(client, 'tenant-1', [comboLine], null, STORE)
    await flush()

    // Assert
    expect(pending.map((read) => read.table).sort()).toEqual(['bundles', 'menu_items', 'tenants'])
  })

  test('a failed dish read still reports the dish failure first', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1', STORE)
    await flush()
    pending.find((read) => read.table === 'menu_items')!.resolve({ data: null, error: { message: 'down' } })

    // Assert — nothing else is read for a cart that cannot be priced.
    await expect(result).resolves.toEqual({ ok: false, refused: false, error: 'Failed to verify item prices' })
    expect(pending.map((read) => read.table)).toEqual(['menu_items'])
  })

  test('a failed add-on read is reported before a failed branch read', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1', STORE)
    await flush()
    pending[0].resolve({ data: [linkedBurger], error: null })
    await flush()
    pending.find((read) => read.table === 'outlet_menu_items')!.resolve({ data: null, error: { message: 'down' } })
    pending.find((read) => read.table === 'categories')!.resolve({ data: null, error: { message: 'down' } })
    pending[1].resolve({ data: [], error: null })

    // Assert
    await expect(result).resolves.toEqual({ ok: false, refused: false, error: 'Failed to verify add-on prices' })
  })

  test('a failed branch read is still an infrastructure failure, never a store-wide price', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1', STORE)
    await flush()
    pending[0].resolve({
      data: [{ id: 'burger', name: 'Burger', price: 100, is_available: true }], error: null,
    })
    await flush()
    pending.find((read) => read.table === 'outlet_menu_items')!.resolve({ data: null, error: { message: 'down' } })

    // Assert
    await expect(result).resolves.toEqual({ ok: false, refused: false, error: 'Failed to verify branch prices' })
  })
})
