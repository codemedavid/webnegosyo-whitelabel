/**
 * Phase 0d: `menu` no longer carries stock or costs.
 *
 *   menu      the ingredient master, recipes, units
 *   inventory deliveries, waste, counts, transfers, reorder levels, stock history
 *   costs     ingredient prices and dish cost
 *
 * Each service checks its own grant on the server, so a hidden button is never
 * the only thing between a kitchen hand and the price list. "Reached the
 * database" below means the gate let the caller through: the stub throws
 * REACHED_DB on the first table read, so nothing else in the service runs.
 */

import { hasPermission, type PermissionHolder, type StaffPermissionKey } from '@/lib/staff-permissions'

const TENANT = 'tenant-1'
const ITEM = '11111111-1111-4111-8111-111111111111'
const UNIT = '22222222-2222-4222-8222-222222222222'

let caller: PermissionHolder = { role: 'admin', is_owner: true, permissions: null }

const verifyTenantAdmin = jest.fn(async () => ({ user: { id: 'user-1' }, userRole: caller }))

jest.mock('@/lib/admin-service', () => ({
  verifyTenantAdmin: (...args: unknown[]) => verifyTenantAdmin(...(args as [])),
  verifyTenantPermission: async (_tenantId: string, key: StaffPermissionKey) => {
    if (!hasPermission(caller, key)) throw new Error('Unauthorized: Missing permission for this feature')
    return { user: { id: 'user-1' }, userRole: caller }
  },
}))

/** The stored ingredient an update is compared against. */
const STORED = {
  id: ITEM,
  name: 'Beef',
  sku: null,
  category: 'Meat',
  stock_unit_id: UNIT,
  unit_cost: 420,
  is_prep: false,
  image_url: null,
  reorder_level: 5,
  is_active: true,
}

const writes: Array<{ table: string; patch: unknown }> = []

/**
 * `inventory_items` answers like a table holding STORED; every other table
 * throws REACHED_DB, which is all a gate test needs to know.
 */
/** What `stock_movements` holds when a test opts into reading it. */
let movementRows: unknown[] | null = null

function chainFor(table: string) {
  if (table === 'stock_movements' && movementRows) {
    const rows = movementRows
    const read: Record<string, unknown> = {}
    Object.assign(read, { select: () => read, eq: () => read, order: () => read, limit: async () => ({ data: rows, error: null }) })
    return read
  }
  if (table !== 'inventory_items') throw new Error('REACHED_DB')
  let patch: unknown = null
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self,
    eq: self,
    update: (value: unknown) => {
      patch = value
      writes.push({ table, patch: value })
      return chain
    },
    insert: (value: unknown) => {
      patch = value
      writes.push({ table, patch: value })
      return chain
    },
    order: async () => ({ data: [STORED], error: null }),
    maybeSingle: async () => ({ data: STORED, error: null }),
    single: async () => ({ data: { ...STORED, ...(patch as object) }, error: null }),
  })
  return chain
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => chainFor(table),
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
  }),
}))

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

jest.mock('@/lib/inventory/acting-branch-scope', () => ({
  resolveActingBranchScope: async () => ({ kind: 'all' }),
}))

const staff = (permissions: string[]): PermissionHolder => ({ role: 'admin', is_owner: false, permissions })
const INVENTORY_ONLY = staff(['inventory'])
const MENU_ONLY = staff(['menu'])
const COSTS_ONLY = staff(['costs'])

const DELIVERY = { inventory_item_id: ITEM, reason: 'receive' as const, quantity: 2, unit_id: UNIT }

beforeEach(() => {
  caller = { role: 'admin', is_owner: true, permissions: null }
  writes.length = 0
  movementRows = null
  verifyTenantAdmin.mockClear()
})

describe('an inventory-only account (a stock clerk)', () => {
  beforeEach(() => {
    caller = INVENTORY_ONLY
  })

  test('can record a delivery', async () => {
    const { recordStockMovement } = await import('@/lib/inventory/stock-service')

    await expect(recordStockMovement(TENANT, DELIVERY)).rejects.toThrow('REACHED_DB')
  })

  test('can read stock history and set a branch reorder level', async () => {
    const { getStockMovements } = await import('@/lib/inventory/stock-service')
    const { setBranchReorderLevel } = await import('@/lib/inventory/branch-par-service')

    await expect(getStockMovements(TENANT, ITEM)).rejects.toThrow('REACHED_DB')
    await expect(setBranchReorderLevel(TENANT, ITEM, null, 3)).rejects.toThrow('REACHED_DB')
  })

  test('can open a count and send a transfer', async () => {
    const { openCount } = await import('@/lib/inventory/count-session-service')
    const { sendStockTransferAction } = await import('@/app/actions/inventory-transfers')

    await expect(openCount(TENANT, { outletId: null })).rejects.toThrow('REACHED_DB')
    await expect(sendStockTransferAction(TENANT, 'shop', 'x')).resolves.toEqual({ success: false, error: 'REACHED_DB' })
  })

  test('can move an ingredient\'s reorder level', async () => {
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')

    await expect(updateIngredient(ITEM, TENANT, { ...STORED, reorder_level: 9 })).resolves.toMatchObject({ reorder_level: 9 })
  })

  test('cannot create an ingredient', async () => {
    const { createIngredient } = await import('@/lib/inventory/ingredients-service')

    await expect(createIngredient(TENANT, { ...STORED, unit_cost: 0 })).rejects.toThrow(/Unauthorized/)
    expect(writes).toEqual([])
  })

  test('cannot change what an ingredient costs', async () => {
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')
    const { INGREDIENT_REFUSALS } = await import('@/lib/inventory/ingredient-write-grants')

    await expect(updateIngredient(ITEM, TENANT, { ...STORED, unit_cost: 999 })).rejects.toThrow(INGREDIENT_REFUSALS.costs)
    expect(writes).toEqual([])
  })

  test('cannot read what a dish costs', async () => {
    const { getMenuItemCost } = await import('@/lib/inventory/costing-service')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-gate')

    await expect(getMenuItemCost(TENANT, 'menu-1')).rejects.toThrow(PERMISSION_REFUSALS.dishCost)
  })
})

describe('a menu-only account (recipes and the ingredient list)', () => {
  beforeEach(() => {
    caller = MENU_ONLY
  })

  test('can rename an ingredient', async () => {
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')

    await expect(updateIngredient(ITEM, TENANT, { ...STORED, name: 'Ground beef' })).resolves.toMatchObject({ name: 'Ground beef' })
    expect(writes).toHaveLength(1)
  })

  test('a form that leaves the price and level out keeps them, rather than zeroing them', async () => {
    // A screen that hides prices from this account omits the field. The schema
    // defaults it to 0 for a NEW ingredient; on an update that default would
    // wipe the stored price (and need Costs & Profit to do it).
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')
    const masterOnly = {
      name: STORED.name,
      category: STORED.category,
      stock_unit_id: STORED.stock_unit_id,
      is_prep: STORED.is_prep,
      is_active: STORED.is_active,
    }

    await expect(updateIngredient(ITEM, TENANT, { ...masterOnly, name: 'Ground beef' })).resolves.toMatchObject({ name: 'Ground beef' })
    expect(writes[0]?.patch).not.toHaveProperty('unit_cost')
    expect(writes[0]?.patch).not.toHaveProperty('reorder_level')
  })

  test('can create an ingredient with no price, but not one with a price', async () => {
    const { createIngredient } = await import('@/lib/inventory/ingredients-service')
    const { INGREDIENT_REFUSALS } = await import('@/lib/inventory/ingredient-write-grants')

    await expect(createIngredient(TENANT, { ...STORED, unit_cost: 0 })).resolves.toMatchObject({ name: 'Beef' })
    await expect(createIngredient(TENANT, STORED)).rejects.toThrow(INGREDIENT_REFUSALS.costs)
  })

  test('cannot change a reorder level from the ingredient form', async () => {
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')
    const { INGREDIENT_REFUSALS } = await import('@/lib/inventory/ingredient-write-grants')

    await expect(updateIngredient(ITEM, TENANT, { ...STORED, reorder_level: 1 })).rejects.toThrow(INGREDIENT_REFUSALS.inventory)
  })

  test('cannot record stock, read its history, or touch a branch shelf', async () => {
    const { recordStockMovement, getStockMovements } = await import('@/lib/inventory/stock-service')
    const { setBranchReorderLevel } = await import('@/lib/inventory/branch-par-service')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-gate')

    await expect(recordStockMovement(TENANT, DELIVERY)).rejects.toThrow(PERMISSION_REFUSALS.recordStock)
    await expect(getStockMovements(TENANT, ITEM)).rejects.toThrow(PERMISSION_REFUSALS.stockHistory)
    await expect(setBranchReorderLevel(TENANT, ITEM, null, 3)).rejects.toThrow(PERMISSION_REFUSALS.reorderLevel)
  })

  test('cannot count or transfer stock', async () => {
    const counts = await import('@/lib/inventory/count-session-service')
    const transfers = await import('@/app/actions/inventory-transfers')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-gate')
    const refused = { success: false, error: PERMISSION_REFUSALS.transfers }

    await expect(counts.openCount(TENANT, { outletId: null })).rejects.toThrow(PERMISSION_REFUSALS.counts)
    await expect(counts.closeCount(TENANT, 'count-1')).rejects.toThrow(PERMISSION_REFUSALS.counts)
    await expect(
      transfers.createStockTransferAction(TENANT, 'shop', { fromOutletId: 'a', toOutletId: 'b', lines: [{ inventoryItemId: ITEM, quantity: 1 }] }),
    ).resolves.toEqual(refused)
    await expect(transfers.sendStockTransferAction(TENANT, 'shop', 'x')).resolves.toEqual(refused)
    await expect(transfers.receiveStockTransferAction(TENANT, 'shop', 'x', {})).resolves.toEqual(refused)
    await expect(transfers.cancelStockTransferAction(TENANT, 'shop', 'x')).resolves.toEqual(refused)
  })

  test('cannot read what a dish costs', async () => {
    const { getMenuItemCost } = await import('@/lib/inventory/costing-service')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-gate')

    await expect(getMenuItemCost(TENANT, 'menu-1')).rejects.toThrow(PERMISSION_REFUSALS.dishCost)
  })
})

describe('a costs-only account (the accountant)', () => {
  beforeEach(() => {
    caller = COSTS_ONLY
  })

  test('can read what a dish costs', async () => {
    const { getMenuItemCost } = await import('@/lib/inventory/costing-service')

    await expect(getMenuItemCost(TENANT, 'menu-1')).rejects.toThrow('REACHED_DB')
  })

  test('can reprice an ingredient but not rename it', async () => {
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')
    const { INGREDIENT_REFUSALS } = await import('@/lib/inventory/ingredient-write-grants')

    await expect(updateIngredient(ITEM, TENANT, { ...STORED, unit_cost: 450 })).resolves.toMatchObject({ unit_cost: 450 })
    await expect(updateIngredient(ITEM, TENANT, { ...STORED, name: 'Wagyu' })).rejects.toThrow(INGREDIENT_REFUSALS.menu)
  })

  test('cannot record stock', async () => {
    const { recordStockMovement } = await import('@/lib/inventory/stock-service')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-gate')

    await expect(recordStockMovement(TENANT, DELIVERY)).rejects.toThrow(PERMISSION_REFUSALS.recordStock)
  })
})

describe('prices are absent, never zero, without Costs & Profit', () => {
  test('stock history leaves the delivery price out for an inventory-only account', async () => {
    caller = INVENTORY_ONLY
    movementRows = [{ id: 'm1', reason: 'receive', quantity_delta: 2, unit_cost: 410 }]
    const { getStockMovements } = await import('@/lib/inventory/stock-service')

    await expect(getStockMovements(TENANT, ITEM)).resolves.toEqual([{ id: 'm1', reason: 'receive', quantity_delta: 2 }])
  })

  test('stock history keeps it for an account holding both grants', async () => {
    caller = staff(['inventory', 'costs'])
    movementRows = [{ id: 'm1', unit_cost: 410 }]
    const { getStockMovements } = await import('@/lib/inventory/stock-service')

    await expect(getStockMovements(TENANT, ITEM)).resolves.toEqual([{ id: 'm1', unit_cost: 410 }])
  })

  test('the ingredient list action leaves prices out for a menu-only account', async () => {
    caller = MENU_ONLY
    const { getIngredientsAction } = await import('@/app/actions/inventory')

    const result = await getIngredientsAction(TENANT)

    expect(result.success).toBe(true)
    expect(result.success && result.data[0]).not.toHaveProperty('unit_cost')
  })

  test('a refused action reads as the sentence, not a generic failure', async () => {
    caller = MENU_ONLY
    const { recordStockMovementAction, getMenuItemCostAction } = await import('@/app/actions/inventory')
    const { PERMISSION_REFUSALS } = await import('@/lib/inventory/permission-gate')

    await expect(recordStockMovementAction(TENANT, 'shop', DELIVERY)).resolves.toEqual({
      success: false,
      error: PERMISSION_REFUSALS.recordStock,
    })
    await expect(getMenuItemCostAction(TENANT, 'menu-1')).resolves.toEqual({
      success: false,
      error: PERMISSION_REFUSALS.dishCost,
    })
  })
})

describe('the owner', () => {
  test('passes every gate', async () => {
    const { recordStockMovement } = await import('@/lib/inventory/stock-service')
    const { getMenuItemCost } = await import('@/lib/inventory/costing-service')
    const { updateIngredient } = await import('@/lib/inventory/ingredients-service')

    await expect(recordStockMovement(TENANT, DELIVERY)).rejects.toThrow('REACHED_DB')
    await expect(getMenuItemCost(TENANT, 'menu-1')).rejects.toThrow('REACHED_DB')
    await expect(updateIngredient(ITEM, TENANT, { ...STORED, name: 'X', unit_cost: 1, reorder_level: 2 })).resolves.toBeTruthy()
  })

  test('the gates name the platform verb they act under', async () => {
    const { recordStockMovement, getStockMovements } = await import('@/lib/inventory/stock-service')

    await expect(recordStockMovement(TENANT, DELIVERY)).rejects.toThrow('REACHED_DB')
    await expect(getStockMovements(TENANT, ITEM)).rejects.toThrow('REACHED_DB')

    expect(verifyTenantAdmin).toHaveBeenCalledWith(TENANT, 'create')
    expect(verifyTenantAdmin).toHaveBeenCalledWith(TENANT, 'view')
  })
})
