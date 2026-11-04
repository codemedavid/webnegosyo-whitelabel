import { assertSimpleOptionStockAvailable, applySimpleOptionStockSettled, capLinesToAvailable } from '@/lib/inventory/simple-option-stock-service'
import { applyOrderStockMovements, applyOrderRevisionStockBestEffort, reverseOrderStockMovements } from '@/lib/inventory/order-stock-service'

const rpc = jest.fn()
const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from, rpc }) }))
jest.mock('@/lib/inventory/stock-alerts-service', () => ({ processStockLevelChanges: jest.fn() }))

const CLAIM_APPLIED = { data: { status: 'applied', rows: [] }, error: null }

beforeEach(() => {
  rpc.mockReset().mockImplementation(async (name: string) =>
    name === 'apply_order_stock_claim' ? CLAIM_APPLIED : { data: 1, error: null })
  from.mockImplementation(() => {
    const chain = { select: () => chain, eq: () => chain, in: () => chain, insert: async () => ({ error: null }), delete: () => chain,
      then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }) }
    return chain
  })
})

it('applies portion quantities to simple option stock even without ingredient recipes', async () => {
  const items = [{ menuItemId: 'burger', quantity: 2, addonIds: ['cheese'], addonQuantities: { cheese: 3 } }]
  const result = await applyOrderStockMovements('tenant', 'order', items, 'sale', 0, 'branch')
  expect(rpc).toHaveBeenCalledWith('apply_simple_option_order_stock', expect.objectContaining({ p_items: items, p_action: 'sale', p_outlet_id: 'branch' }))
  expect(result.movementCount).toBe(1)
})

it('cancels recorded simple option movements even without ingredient movements', async () => {
  const result = await reverseOrderStockMovements('tenant', 'order')
  expect(rpc).toHaveBeenCalledWith('apply_simple_option_order_stock', expect.objectContaining({ p_action: 'cancel', p_order_id: 'order' }))
  expect(result.movementCount).toBe(1)
})


it('refuses aggregate simple stock demand across separately configured cart lines', async () => {
  const data = [{ id: 'burger', modifier_groups: [{ options: [{ id: 'cheese', name: 'Cheese', stock_mode: 'simple', stock_qty: 6 }] }] }]
  from.mockImplementation(() => {
    const chain = { select: () => chain, eq: () => chain, in: async () => ({ data, error: null }) }
    return chain
  })
  await expect(assertSimpleOptionStockAvailable('tenant', [
    { menuItemId: 'burger', quantity: 2, addonIds: ['cheese'], addonQuantities: { cheese: 3 } },
    { menuItemId: 'burger', quantity: 1, addonIds: ['cheese'] },
  ])).rejects.toThrow('Not enough stock for Cheese')
  expect(rpc).not.toHaveBeenCalled()
})

describe('a counter that cannot cover the sale', () => {
  const CATALOG = [{ id: 'burger', modifier_groups: [{ options: [
    { id: 'cheese', name: 'Cheese', stock_mode: 'simple', stock_qty: 3 },
    { id: 'bacon', name: 'Bacon', stock_mode: 'simple', stock_qty: 10 },
  ] }] }]
  const LINES = [{ menuItemId: 'burger', quantity: 5, addonIds: ['cheese', 'bacon'], modifierOptionIds: ['cheese', 'bacon'] }]
  const insufficient = { data: null, error: { message: 'Insufficient stock for Cheese' } }

  function catalogReads() {
    from.mockImplementation(() => {
      const chain = { select: () => chain, eq: () => chain, in: async () => ({ data: CATALOG, error: null }) }
      return chain
    })
  }

  it('decrements every option it can, the short one down to what is left, and names the shortfall', async () => {
    catalogReads()
    rpc.mockResolvedValueOnce(insufficient).mockResolvedValueOnce({ data: 2, error: null })

    const result = await applySimpleOptionStockSettled({ from, rpc } as never, 'tenant', 'order', 'sale', 0, LINES, null)

    expect(result).toEqual({ count: 2, shortfalls: ['Cheese: 5 sold, 3 in stock'] })
    const retried = rpc.mock.calls[1][1].p_items
    expect(retried).toEqual([
      expect.objectContaining({ menuItemId: 'burger', quantity: 5, addonIds: ['bacon'], modifierOptionIds: ['bacon'] }),
      { menuItemId: 'burger', quantity: 3, optionIds: [], addonIds: ['cheese'], modifierOptionIds: ['cheese'] },
    ])
  })

  it('gives up after a few races without throwing — terminal, recorded, no retry loop', async () => {
    catalogReads()
    rpc.mockResolvedValue(insufficient)
    const result = await applySimpleOptionStockSettled({ from, rpc } as never, 'tenant', 'order', 'sale', 0, LINES, null)
    expect(result.count).toBe(0)
    expect(result.shortfalls).toEqual(['Cheese: 5 sold, 3 in stock'])
    expect(rpc).toHaveBeenCalledTimes(4)
  })

  it('still throws a real outage', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } })
    await expect(applySimpleOptionStockSettled({ from, rpc } as never, 'tenant', 'order', 'sale', 0, LINES, null))
      .rejects.toEqual({ message: 'connection refused' })
  })

  it('an edit that runs a counter short is settled, not a 503 the app retries forever', async () => {
    catalogReads()
    rpc.mockImplementation(async (name: string, args: { p_items?: unknown[] }) => {
      if (name === 'apply_order_stock_claim') return CLAIM_APPLIED
      const asksForAllCheese = JSON.stringify(args.p_items).includes('"cheese","bacon"')
      return asksForAllCheese ? insufficient : { data: 2, error: null }
    })
    const outcome = await applyOrderRevisionStockBestEffort('tenant', 'order', 2, LINES, [], null)
    expect(outcome).toBe('settled')
  })

  it('a dish whose option is switched off spends nothing of it', () => {
    expect(capLinesToAvailable(LINES, [{ menuItemId: 'burger', optionId: 'cheese', quantity: 5, available: 0, name: 'Cheese' }]))
      .toEqual([expect.objectContaining({ addonIds: ['bacon'] })])
  })
})
