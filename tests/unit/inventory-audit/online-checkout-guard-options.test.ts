/**
 * Audit (2026-10-13): checkout's producible-quantity guard judges a cart line by
 * its BASE recipe only, and `createOrderAction` hands it only
 * `{ menuItemId, quantity }` (src/app/actions/orders.ts ~419-427) — the line's
 * option_ids / addon_ids are dropped before the guard even sees them. Depletion
 * then spends the option recipes in full. A dish whose stock lives entirely in
 * its variations is therefore never capped, and an online order can drive the
 * variation's ingredient negative.
 *
 * Live shape: keto-lifestyle-cafe "Creamy Plain Peanut (Unsweetened)" has NO
 * base recipe; its Size options carry the stock (260grams → 1 pc "Plain Peanut
 * Butter 260g Small", 600grams → 1 pc "…600g BIG"). Order 91db1e9f… (2026-10-11)
 * deducted the 260g jar correctly — but nothing stops a cart of more jars than
 * are on the shelf.
 *
 * `producible.ts` documents base-only as deliberate; this is reported as an
 * INCONSISTENCY with depletion (and with simple option stock, which IS checked
 * at checkout), not as an arithmetic bug.
 */
import { resolveOrderDepletions } from '@/lib/inventory/order-depletion'
import type { Recipe, RecipeComponent } from '@/types/database'
import type { TenantStockGraph } from '@/lib/inventory/stock-graph-read'

const PEANUT = 'peanut-butter'
const BIG_JAR = 'opt_20_qumji3'
const JAR_600 = 'jar-600g'

const recipes: Recipe[] = [
  { id: 'r-600', tenant_id: 't1', target_type: 'modifier_option', menu_item_id: PEANUT, modifier_option_id: BIG_JAR, created_at: '', updated_at: '' },
]
const components: RecipeComponent[] = [
  { id: 'c1', tenant_id: 't1', recipe_id: 'r-600', inventory_item_id: JAR_600, quantity: 1, unit_id: 'pc', sort_order: 0, created_at: '', updated_at: '' },
]
const PIECE = { id: 'pc', name: 'piece', abbreviation: 'pc', dimension: 'count' as const, to_base_factor: 1 }

const graph: TenantStockGraph = {
  recipes,
  components,
  shelf: [{ id: JAR_600, current_qty: 2, is_active: true, stockUnit: PIECE }],
  units: [PIECE],
  namesByMenuItemId: new Map([[PEANUT, 'Creamy Plain Peanut (Unsweetened)']]),
}

jest.mock('@/lib/inventory/stock-graph-read', () => ({
  readTenantStockGraph: async () => graph,
}))

describe('checkout guard vs. variation-only stock', () => {
  it('refuses a cart of five 600g jars when two are on the shelf, as depletion will spend five', async () => {
    const { findCheckoutStockShortfallMessage } = await import('@/lib/inventory/checkout-stock-guard')
    const cartLine = {
      menuItemId: PEANUT,
      quantity: 5,
      optionIds: [BIG_JAR],
      modifierOptionIds: [BIG_JAR],
    }

    // What the order will actually take off the shelf once accepted.
    const spent = resolveOrderDepletions([cartLine], recipes, components)
    expect(spent).toEqual([{ inventoryItemId: JAR_600, quantity: 5, unitId: 'pc' }])

    const message = await findCheckoutStockShortfallMessage('t1', [cartLine], null)

    // FAILS today: '' (no base recipe → "untracked"), so 5 jars are accepted
    // against 2 and the shelf goes to -3.
    expect(message).not.toBe('')
  })
})
