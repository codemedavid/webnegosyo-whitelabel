/**
 * A linked add-on ("Add a Coke") is a live reference to another dish. When that
 * dish is switched off the storefront greys the option out, but the server
 * never read the dish's availability, so a stale tab or a direct call still
 * ordered it. The linked read now carries `is_available`, and an unavailable
 * linked dish refuses the line in words the diner can act on.
 */

import { describe, test, expect } from '@jest/globals'
import { loadAndPriceOrderLines, type LinePricingClient } from '@/lib/checkout/load-line-pricing'
import type { PriceableOrderLine } from '@/lib/checkout/price-order-lines'

const burger = {
  id: 'burger', name: 'Burger', price: 100, is_available: true,
  modifier_groups: [{
    id: 'g-drink', name: 'Drink', display_order: 0, min_select: 0, max_select: 1,
    options: [{ id: 'o-coke', name: '', price_modifier: 0, display_order: 0, menu_item_id: 'coke' }],
  }],
}

function clientWith(coke: Record<string, unknown>) {
  const selects: Array<{ table: string; columns: string }> = []
  const client: LinePricingClient = {
    from: (table: string) => {
      let columns = ''
      const chain: Record<string, unknown> = {
        select: (cols: string) => { columns = cols; selects.push({ table, columns }); return chain },
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          const data = table === 'menu_items'
            ? (columns.includes('modifier_groups') ? [burger] : [coke])
            : []
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      }
      return chain
    },
  }
  return { client, selects }
}

const line: PriceableOrderLine = {
  menu_item_id: 'burger', menu_item_name: 'Burger', price: 150, subtotal: 150, quantity: 1,
  option_ids: ['o-coke'], variation: 'Coke',
}

describe('loadAndPriceOrderLines — linked add-on availability', () => {
  test('reads the linked dish’s availability', async () => {
    const { client, selects } = clientWith({ id: 'coke', name: 'Coke', price: 50, is_available: true })

    await loadAndPriceOrderLines(client, 'tenant-1', [line], null)

    const linkedRead = selects.find((read) => read.table === 'menu_items' && !read.columns.includes('modifier_groups'))
    expect(linkedRead?.columns).toMatch(/is_available/)
  })

  test('refuses a line whose linked add-on dish is unavailable', async () => {
    const { client } = clientWith({ id: 'coke', name: 'Coke', price: 50, is_available: false })

    const result = await loadAndPriceOrderLines(client, 'tenant-1', [line], null)

    expect(result).toMatchObject({ ok: false, refused: true })
    if (result.ok) return
    expect(result.error).toMatch(/Coke/)
  })

  test('accepts it while the linked dish is available', async () => {
    const { client } = clientWith({ id: 'coke', name: 'Coke', price: 50, is_available: true })

    const result = await loadAndPriceOrderLines(client, 'tenant-1', [line], null)

    expect(result).toMatchObject({ ok: true, itemsSubtotal: 150 })
  })
})
