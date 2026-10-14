/**
 * The Owl under the Phase 0d split: stock is `inventory`, prices are `costs`,
 * and `menu` keeps only recipes and the ingredient list.
 */

jest.mock('server-only', () => ({}))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

const getMenuItemCost = jest.fn()
jest.mock('@/lib/inventory/costing-service', () => ({
  getMenuItemCost: (...args: unknown[]) => getMenuItemCost(...args),
}))

const FLAGS = { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true }
const staff = (permissions: string[]) => ({ userId: 'u', role: 'admin', is_owner: false, permissions })

const STATUS = {
  activeCount: 3,
  outCount: 1,
  lowCount: 1,
  stockValue: 1250,
  attention: [{ id: 'i1', name: 'Beef', level: 'out' as const, quantity: 0, unit: 'kg', reorderLevel: 5 }],
}

beforeEach(() => getMenuItemCost.mockReset())

describe('who is offered the stock tools', () => {
  test('a menu-only account no longer sees stock or files stock changes', async () => {
    const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
    const { availableTools } = await import('@/lib/assistant/tools/registry')

    const names = availableTools(ASSISTANT_TOOLS, staff(['menu']), FLAGS).map((tool) => tool.name)

    expect(names).not.toContain('get_inventory')
    expect(names).not.toContain('propose_stock_adjustment')
  })

  test('an inventory-only account sees stock and may propose a stock change', async () => {
    const { ASSISTANT_TOOLS } = await import('@/lib/assistant/tools')
    const { availableTools } = await import('@/lib/assistant/tools/registry')

    const names = availableTools(ASSISTANT_TOOLS, staff(['inventory']), FLAGS).map((tool) => tool.name)

    expect(names).toEqual(expect.arrayContaining(['get_inventory', 'propose_stock_adjustment']))
  })

  test('confirming a stock change needs inventory', async () => {
    const { ACTION_PERMISSION } = await import('@/lib/assistant/actions/kinds')

    expect(ACTION_PERMISSION.stock_adjustment).toBe('inventory')
  })
})

describe('get_inventory without Costs & Profit', () => {
  test('leaves the stock value out of the facts and the card', async () => {
    const { buildStockResult } = await import('@/lib/assistant/tools/reads/inventory')
    const { createRefBook } = await import('@/lib/assistant/refs')

    const result = buildStockResult(STATUS, createRefBook({}), false)

    expect(result.facts).not.toHaveProperty('stockValue')
    expect(JSON.stringify(result.card)).not.toMatch(/₱|worth/)
  })

  test('keeps it for an account that holds costs', async () => {
    const { buildStockResult } = await import('@/lib/assistant/tools/reads/inventory')
    const { createRefBook } = await import('@/lib/assistant/refs')

    const result = buildStockResult(STATUS, createRefBook({}), true)

    expect(result.facts).toMatchObject({ stockValue: 1250 })
    expect(JSON.stringify(result.card)).toMatch(/worth/)
  })
})

describe('promotion maths without Costs & Profit', () => {
  test('never reads a recipe cost, so the break-even falls back to the assumed food cost', async () => {
    const { recipeUnitCost } = await import('@/lib/assistant/tools/reads/promotions')

    await expect(recipeUnitCost(staff(['analytics']), 't1', 'item-1')).resolves.toBeNull()
    expect(getMenuItemCost).not.toHaveBeenCalled()
  })

  test('reads it for an account that holds costs', async () => {
    getMenuItemCost.mockResolvedValue({ baseCost: 42 })
    const { recipeUnitCost } = await import('@/lib/assistant/tools/reads/promotions')

    await expect(recipeUnitCost(staff(['analytics', 'costs']), 't1', 'item-1')).resolves.toBe(42)
  })
})

describe('a refused confirm says which grant to ask for', () => {
  test('passes a named refusal through instead of the generic line', async () => {
    const { friendlyExecuteError } = await import('@/lib/assistant/actions/execute')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-refusals')

    expect(friendlyExecuteError(new Error(PERMISSION_REFUSALS.recordStock))).toBe(PERMISSION_REFUSALS.recordStock)
    expect(friendlyExecuteError(new Error('Unauthorized: Missing permission for this feature'))).toBe(
      'You no longer have permission to do this.',
    )
  })
})
