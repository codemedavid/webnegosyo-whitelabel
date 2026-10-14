/**
 * Audit (2026-10-13): a recipe line whose unit can NEVER convert to the
 * ingredient's stock unit (a count unit against a weight/volume stock unit, or
 * the reverse) is SAVED without complaint, and then every sale silently skips
 * it (`order-stock-service.ts` depleteClaimedOrder: `resolveMovementDelta`
 * throws → `skipped.push`). The only trace is an audit-log `detail` string.
 *
 * Weight↔volume was bridged at water density on 2026-10-06 (#73), which fixed
 * the g-vs-ml skips seen live before that date (sorpresso web orders
 * 6116aebc…, f41137c2…). Count↔mass is still unconvertible by design, and the
 * platform DB holds such lines today, e.g. keto-lifestyle-cafe "Cafe Latte"
 * (Equal 1 g, stocked in pc), "Almond Carbonara" (noodles 1 pc, stocked in g),
 * snxp-ktchn "GLAZE CRAZE" (Chicken 80 pc, stocked in kg), 928-cafe-grill
 * "French Fries" (potato 1 pc, stocked in g), 11-21-cafe-chill "Black Tea Yuzu"
 * (tea 150 ml, stocked in pc).
 */
import { resolveMovementDelta } from '@/lib/inventory/stock-ledger'
import type { InventoryUnit } from '@/lib/inventory/unit-conversion'

const GRAM: InventoryUnit = { id: 'u-g', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1 }
const PIECE: InventoryUnit = { id: 'u-pc', name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1 }

const SWEETENER = '11111111-1111-4111-8111-111111111111'
const UNIT_G = '22222222-2222-4222-8222-222222222222'
const UNIT_PC = '33333333-3333-4333-8333-333333333333'

const unitRows = [
  { id: UNIT_G, tenant_id: 't1', name: 'gram', abbreviation: 'g', dimension: 'weight', to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '' },
  { id: UNIT_PC, tenant_id: 't1', name: 'piece', abbreviation: 'pc', dimension: 'count', to_base_factor: 1, is_base: true, is_active: true, created_at: '', updated_at: '' },
]
const ingredientRows = [{ id: SWEETENER, tenant_id: 't1', name: '1019: Equal', stock_unit_id: UNIT_PC }]

/** A permissive PostgREST double: every builder method chains; awaiting yields the table's rows. */
function table(name: string, writes: string[]) {
  const rows = name === 'inventory_units' ? unitRows : name === 'inventory_items' ? ingredientRows : []
  const chain: Record<string, unknown> = {}
  const self = () => chain
  for (const m of ['select', 'eq', 'in', 'order', 'delete', 'update']) chain[m] = self
  chain.insert = (payload: unknown) => {
    writes.push(name)
    const inserted = Array.isArray(payload) ? payload : [{ id: 'recipe-1', ...(payload as object) }]
    const insertChain: Record<string, unknown> = {
      select: () => insertChain,
      single: async () => ({ data: inserted[0], error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: inserted, error: null }),
    }
    return insertChain
  }
  chain.maybeSingle = async () => ({ data: null, error: null })
  chain.single = async () => ({ data: rows[0] ?? null, error: null })
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null })
  return chain
}

const writes: string[] = []
jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: (name: string) => table(name, writes) }),
}))
jest.mock('@/lib/admin-service', () => ({ verifyTenantPermission: async () => undefined }))

describe('recipe lines that can never be deducted', () => {
  it('mechanism: the ledger cannot convert grams of an ingredient stocked by the piece (so every sale skips it)', () => {
    expect(() =>
      resolveMovementDelta({ reason: 'sale', quantity: 1, unit: GRAM, stockUnit: PIECE, currentQty: 100 }),
    ).toThrow(/across dimensions/)
  })

  it('refuses to save an option recipe line whose unit cannot convert to the ingredient stock unit', async () => {
    const { saveRecipeForTarget } = await import('@/lib/inventory/recipes-service')
    writes.length = 0

    const save = saveRecipeForTarget(
      't1',
      { type: 'modifier_option', menuItemId: 'cafe-latte', modifierOptionId: 'opt-sweet' },
      { components: [{ inventory_item_id: SWEETENER, quantity: 1, unit_id: UNIT_G }] },
    )

    // FAILS today: it resolves and writes recipe_components, and every later
    // sale of that option spends none of the sweetener.
    await expect(save).rejects.toThrow()
    expect(writes).not.toContain('recipe_components')
  })
})
