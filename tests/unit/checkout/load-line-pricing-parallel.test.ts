/**
 * Line pricing used to read the dishes, then the linked add-on dishes, then
 * the branch's price overrides, then the combos — four sequential round trips
 * on the path of every branch or combo order. Only the linked dishes depend on
 * another read (they are named inside the dish JSON); the branch overrides and
 * the combo catalog are keyed by the cart alone, so they ride alongside the
 * dish read.
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

const plainLine: PriceableOrderLine = {
  menu_item_id: 'burger', menu_item_name: 'Burger', price: 100, subtotal: 100, quantity: 1,
}

describe('loadAndPriceOrderLines — independent reads run together', () => {
  test('starts the branch override read without waiting for the dish read', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1')
    await flush()

    // Assert — both reads are in flight before either answered.
    expect(pending.map((read) => read.table).sort()).toEqual(['menu_items', 'outlet_menu_items'])

    pending.find((read) => read.table === 'menu_items')!.resolve({
      data: [{ id: 'burger', name: 'Burger', price: 100, is_available: true }], error: null,
    })
    pending.find((read) => read.table === 'outlet_menu_items')!.resolve({ data: [], error: null })
    await expect(result).resolves.toMatchObject({ ok: true, itemsSubtotal: 100 })
  })

  test('starts the combo reads alongside the dish read', async () => {
    // Arrange
    const { client, pending } = deferredClient()
    const comboLine: PriceableOrderLine = { ...plainLine, isBundleItem: true, bundleId: 'combo' }

    // Act
    void loadAndPriceOrderLines(client, 'tenant-1', [comboLine], null)
    await flush()

    // Assert
    expect(pending.map((read) => read.table).sort()).toEqual(['bundles', 'menu_items', 'tenants'])
  })

  test('a failed dish read still reports the dish failure first', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1')
    await flush()
    pending.find((read) => read.table === 'outlet_menu_items')!.resolve({ data: null, error: { message: 'down' } })
    pending.find((read) => read.table === 'menu_items')!.resolve({ data: null, error: { message: 'down' } })

    // Assert
    await expect(result).resolves.toEqual({ ok: false, refused: false, error: 'Failed to verify item prices' })
  })

  test('a failed branch read is still an infrastructure failure, never a store-wide price', async () => {
    // Arrange
    const { client, pending } = deferredClient()

    // Act
    const result = loadAndPriceOrderLines(client, 'tenant-1', [plainLine], 'outlet-1')
    await flush()
    pending.find((read) => read.table === 'menu_items')!.resolve({
      data: [{ id: 'burger', name: 'Burger', price: 100, is_available: true }], error: null,
    })
    pending.find((read) => read.table === 'outlet_menu_items')!.resolve({ data: null, error: { message: 'down' } })

    // Assert
    await expect(result).resolves.toEqual({ ok: false, refused: false, error: 'Failed to verify branch prices' })
  })
})
