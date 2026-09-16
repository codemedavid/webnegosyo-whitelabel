import { assertSimpleOptionStockAvailable } from '@/lib/inventory/simple-option-stock-service'
import { applyOrderStockMovements, reverseOrderStockMovements } from '@/lib/inventory/order-stock-service'

const rpc = jest.fn()
const from = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from, rpc }) }))
jest.mock('@/lib/inventory/stock-alerts-service', () => ({ processStockLevelChanges: jest.fn() }))

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: 1, error: null })
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
