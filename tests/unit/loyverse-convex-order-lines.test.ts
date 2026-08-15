import { buildLoyverseOrderItemsFromConvexOrder } from '@/lib/loyverse/convex-order-lines'

function convexLine(overrides: Record<string, unknown> = {}) {
  return {
    menuItemId: 'mi-1',
    menuItemName: 'Americano',
    quantity: 2,
    price: 120,
    subtotal: 240,
    ...overrides,
  }
}

describe('buildLoyverseOrderItemsFromConvexOrder', () => {
  it('maps a Convex order line to the platform OrderItem shape', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([convexLine()])

    expect(items).toEqual([
      {
        menu_item_id: 'mi-1',
        menu_item_name: 'Americano',
        addons: [],
        quantity: 2,
        price: 120,
        subtotal: 240,
      },
    ])
  })

  it('derives the unit price from the subtotal so option surcharges reach the receipt', () => {
    // The register stores the base price on `price` but banks the surcharge in
    // the subtotal. Loyverse prices per line, so the paid amount is what counts.
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({ quantity: 2, price: 120, subtotal: 300 }),
    ])

    expect(items[0].price).toBe(150)
  })

  it('turns variationSelections into the variations map receipt building resolves', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({
        variationSelections: [
          { typeName: 'Size', optionName: 'Large', priceAdjustment: 20 },
          { typeName: 'Spice', optionName: 'Hot', priceAdjustment: 0 },
        ],
      }),
    ])

    expect(items[0].variations).toEqual({ Size: 'Large', Spice: 'Hot' })
  })

  it('omits variations entirely when the line has no selections', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([convexLine()])

    expect(items[0].variations).toBeUndefined()
  })

  it('carries the legacy single-variation string through', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({ variation: 'Large' }),
    ])

    expect(items[0].variation).toBe('Large')
  })

  it('reduces addon objects to the names receipt building looks up', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({
        addons: [
          { name: 'Extra Shot', price: 30 },
          { name: 'Oat Milk', price: 20 },
        ],
      }),
    ])

    expect(items[0].addons).toEqual(['Extra Shot', 'Oat Milk'])
  })

  it('carries special instructions onto the receipt line note', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({ specialInstructions: 'No sugar' }),
    ])

    expect(items[0].special_instructions).toBe('No sugar')
  })

  it('drops a line whose menu item was deleted, since it maps to no variant', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({ menuItemId: undefined }),
      convexLine({ menuItemId: '' }),
      convexLine({ menuItemId: 'mi-2' }),
    ])

    expect(items.map((item) => item.menu_item_id)).toEqual(['mi-2'])
  })

  it('drops a line with a non-positive quantity instead of dividing by zero', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({ quantity: 0 }),
      convexLine({ quantity: -1 }),
    ])

    expect(items).toEqual([])
  })

  it('drops malformed rows without throwing, because this is an external response', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      null,
      undefined,
      'not-an-object',
      42,
      convexLine(),
    ] as unknown[])

    expect(items).toHaveLength(1)
  })

  it('returns an empty list for an order with no lines', () => {
    expect(buildLoyverseOrderItemsFromConvexOrder([])).toEqual([])
  })

  it('ignores malformed selections and addons rather than dropping the whole line', () => {
    const items = buildLoyverseOrderItemsFromConvexOrder([
      convexLine({
        variationSelections: [{ typeName: 'Size' }, null, { optionName: 'Hot' }],
        addons: [{ price: 10 }, null, { name: 'Oat Milk', price: 20 }],
      }),
    ])

    expect(items).toHaveLength(1)
    expect(items[0].variations).toBeUndefined()
    expect(items[0].addons).toEqual(['Oat Milk'])
  })
})
