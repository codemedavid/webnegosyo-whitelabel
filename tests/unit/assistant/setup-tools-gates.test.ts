/** @jest-environment node */
/**
 * Review fixes (2026-11-12): Lalamove bookings are only counted where the
 * store's orders live (platform), never reported as 0 for a Convex store; a
 * recipe read by a `menu`-only account leaves out what is on the shelf.
 */
import { createRefBook } from '@/lib/assistant/refs'

jest.mock('server-only', () => ({}))

const tables: string[] = []
const ROWS: Record<string, unknown> = {
  tenants: { lalamove_enabled: true, lalamove_market: 'PH', lalamove_sandbox: false, lalamove_sender_phone: '09171234567', footer_phone: null, restaurant_latitude: 14.5, restaurant_longitude: 121 },
  outlets: [],
  order_types: [{ id: 'd' }],
  orders: [{ lalamove_status: 'COMPLETED' }],
  menu_items: [{ id: 'sisig', name: 'Sisig' }],
  inventory_units: [{ id: 'g', abbreviation: 'g' }],
}
function chainFor(table: string) {
  const result = { data: ROWS[table] ?? [], error: null }
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'not', 'gte', 'limit', 'ilike', 'order']) chain[method] = () => chain
  chain.maybeSingle = async () => result
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}
// Every read is the caller's own session now (RLS applies), never the service role.
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      tables.push(table)
      return chainFor(table)
    },
  }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('Owl set-up reads must not use the service role')
  },
}))
jest.mock('@/lib/tenants-service', () => ({ hasStoredLalamoveKeys: async () => true }))
jest.mock('@/lib/inventory/ingredients-service', () => ({
  getIngredients: async () => [{ id: 'pork', name: 'Pork', current_qty: 900, stock_unit_id: 'g', is_active: true }],
}))
jest.mock('@/lib/inventory/stock-graph-read', () => ({
  readTenantStockGraph: async () => ({
    recipes: [{ id: 'r1', target_type: 'menu_item', menu_item_id: 'sisig' }],
    components: [{ id: 'c1', recipe_id: 'r1', inventory_item_id: 'pork', quantity: 150, unit_id: 'g' }],
    shelf: [{ id: 'pork', current_qty: 900, is_active: true, stockUnit: { id: 'g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 } }],
    units: [{ id: 'g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }],
    namesByMenuItemId: new Map([['sisig', 'Sisig']]),
  }),
}))
jest.mock('@/lib/inventory/costing-service', () => ({ getMenuItemCost: async () => ({ baseCost: 42 }) }))

import { getDeliverySetupTool } from '@/lib/assistant/tools/reads/delivery-setup'
import { getDishRecipeTool } from '@/lib/assistant/tools/reads/ingredient'

function ctx(permissions: string[] | null, isOwner: boolean, isPlatformOrders?: boolean) {
  return {
    tenantId: 't',
    tenantSlug: 's',
    conversationId: 'c',
    caller: { userId: 'u', role: 'admin', is_owner: isOwner, permissions },
    flags: { inventoryEnabled: true, customerHubOn: true, menuEngineeringEnabled: true, isPlatformOrders },
    refs: createRefBook({}),
    photos: [],
    memo: <T,>(_key: string, load: () => Promise<T>) => load(),
  }
}

beforeEach(() => {
  tables.length = 0
})

test('a platform store has its Lalamove bookings counted', async () => {
  const result = await getDeliverySetupTool.run(ctx(null, true, true), {})
  expect(result.facts.bookingsLast7Days).toEqual({ total: 1, done: 1, active: 0, cancelled: 0 })
})

test('a Convex / own-database store never reads the platform orders table and is told "unavailable", not 0', async () => {
  const result = await getDeliverySetupTool.run(ctx(null, true, false), {})
  expect(tables).not.toContain('orders')
  expect(result.facts.bookingsLast7Days).toBe('unavailable')
})

test('a menu-only account reads the recipe without the shelf', async () => {
  const result = await getDishRecipeTool.run(ctx(['assistant', 'menu'], false), { dish: 'Sisig' })
  expect(result.facts).not.toHaveProperty('canStillMake')
  expect(result.facts.ingredients).toEqual([{ ref: 'g1', name: 'Pork', perDish: '150 g' }])
  expect(JSON.stringify(result.card)).not.toMatch(/on hand|can still be made/)
})

test('an inventory holder sees the shelf too; costs stay behind `costs`', async () => {
  const result = await getDishRecipeTool.run(ctx(['assistant', 'menu', 'inventory'], false), { dish: 'Sisig' })
  expect(result.facts).toMatchObject({ canStillMake: 6, ingredients: [{ name: 'Pork', onHand: '900 g' }] })
  expect(result.facts).not.toHaveProperty('recipeCost')
  const owner = await getDishRecipeTool.run(ctx(null, true), { dish: 'Sisig' })
  expect(owner.facts).toMatchObject({ recipeCost: 42 })
})
