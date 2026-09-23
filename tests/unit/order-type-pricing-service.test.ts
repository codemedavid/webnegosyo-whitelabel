/**
 * `order-type-pricing-service` — the exact per-item prices an order type
 * carries on the register.
 *
 * Every write goes through the store_setup permission and lands scoped to the
 * tenant; the upsert keys on (order_type_id, menu_item_id) so re-setting a
 * price replaces the row instead of tripping the unique index.
 */

const verifyTenantPermission = jest.fn((..._args: unknown[]) => Promise.resolve())
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...args: unknown[]) => verifyTenantPermission(...args),
}))

const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve({ from: (...a: unknown[]) => from(...a) }),
}))

const TENANT = 'tenant-1'
const ORDER_TYPE = 'ot-grab'
const ITEM = 'item-silog'

interface Chain {
  calls: Record<string, unknown[][]>
}

function wire(result: { data?: unknown; error?: { message: string } | null } = {}) {
  const calls: Record<string, unknown[][]> = {}
  const payload = { data: result.data ?? null, error: result.error ?? null }
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(payload),
    calls,
  }
  for (const method of ['select', 'upsert', 'delete', 'eq', 'order', 'single']) {
    chain[method] = (...args: unknown[]) => {
      calls[method] = [...(calls[method] ?? []), args]
      return chain
    }
  }
  from.mockImplementation(() => chain)
  return chain as unknown as Chain
}

async function loadService() {
  return import('@/lib/order-type-pricing-service')
}

beforeEach(() => {
  from.mockReset()
  verifyTenantPermission.mockClear()
})

describe('orderTypeItemPriceSchema', () => {
  it('accepts a zero price and refuses a negative one', async () => {
    const { orderTypeItemPriceSchema } = await loadService()
    expect(orderTypeItemPriceSchema.safeParse({ menu_item_id: ITEM, price: 0 }).success).toBe(true)
    expect(orderTypeItemPriceSchema.safeParse({ menu_item_id: ITEM, price: -1 }).success).toBe(false)
  })

  it('refuses a NaN price', async () => {
    const { orderTypeItemPriceSchema } = await loadService()
    expect(
      orderTypeItemPriceSchema.safeParse({ menu_item_id: ITEM, price: Number.NaN }).success
    ).toBe(false)
  })
})

describe('listOrderTypeItemPrices', () => {
  it('requires store_setup and scopes by tenant and order type', async () => {
    const chain = wire({ data: [] })
    const { listOrderTypeItemPrices } = await loadService()

    await listOrderTypeItemPrices(TENANT, ORDER_TYPE)

    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'store_setup')
    expect(from).toHaveBeenCalledWith('order_type_item_prices')
    expect(chain.calls.eq).toEqual(
      expect.arrayContaining([
        ['tenant_id', TENANT],
        ['order_type_id', ORDER_TYPE],
      ])
    )
  })

  it('returns the rows', async () => {
    const row = { id: 'p1', tenant_id: TENANT, order_type_id: ORDER_TYPE, menu_item_id: ITEM, price: 150 }
    wire({ data: [row] })
    const { listOrderTypeItemPrices } = await loadService()

    await expect(listOrderTypeItemPrices(TENANT, ORDER_TYPE)).resolves.toEqual([row])
  })

  it('throws the database error', async () => {
    wire({ error: { message: 'boom' } })
    const { listOrderTypeItemPrices } = await loadService()

    await expect(listOrderTypeItemPrices(TENANT, ORDER_TYPE)).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('setOrderTypeItemPrice', () => {
  it('upserts on (order_type_id, menu_item_id) with the tenant attached', async () => {
    const chain = wire({ data: { id: 'p1', price: 150 } })
    const { setOrderTypeItemPrice } = await loadService()

    await setOrderTypeItemPrice(TENANT, ORDER_TYPE, { menu_item_id: ITEM, price: 150 })

    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'store_setup')
    const [row, options] = chain.calls.upsert[0]
    expect(row).toEqual({
      tenant_id: TENANT,
      order_type_id: ORDER_TYPE,
      menu_item_id: ITEM,
      price: 150,
    })
    expect(options).toMatchObject({ onConflict: 'order_type_id,menu_item_id' })
  })

  it('refuses an invalid price before touching the database', async () => {
    wire()
    const { setOrderTypeItemPrice } = await loadService()

    await expect(
      setOrderTypeItemPrice(TENANT, ORDER_TYPE, { menu_item_id: ITEM, price: -5 })
    ).rejects.toThrow()
    expect(from).not.toHaveBeenCalled()
  })
})

describe('clearOrderTypeItemPrice', () => {
  it('deletes scoped by tenant, order type and item', async () => {
    const chain = wire()
    const { clearOrderTypeItemPrice } = await loadService()

    await clearOrderTypeItemPrice(TENANT, ORDER_TYPE, ITEM)

    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'store_setup')
    expect(chain.calls.delete).toHaveLength(1)
    expect(chain.calls.eq).toEqual(
      expect.arrayContaining([
        ['tenant_id', TENANT],
        ['order_type_id', ORDER_TYPE],
        ['menu_item_id', ITEM],
      ])
    )
  })

  it('throws the database error', async () => {
    wire({ error: { message: 'nope' } })
    const { clearOrderTypeItemPrice } = await loadService()

    await expect(clearOrderTypeItemPrice(TENANT, ORDER_TYPE, ITEM)).rejects.toMatchObject({ message: 'nope' })
  })
})

describe('listPricingMenuItems', () => {
  it('selects the lean projection with the category name, scoped by tenant', async () => {
    const chain = wire({
      data: [{ id: ITEM, name: 'Silog', price: '120.00', discounted_price: null, category: { name: 'Rice' } }],
    })
    const { listPricingMenuItems } = await loadService()

    const items = await listPricingMenuItems(TENANT)

    expect(from).toHaveBeenCalledWith('menu_items')
    expect(chain.calls.eq).toEqual(expect.arrayContaining([['tenant_id', TENANT]]))
    expect(items).toEqual([
      { id: ITEM, name: 'Silog', price: 120, discounted_price: null, category_name: 'Rice' },
    ])
  })
})

// A module, not a script: without this, top-level helpers collide across test files under tsc.
export {};
