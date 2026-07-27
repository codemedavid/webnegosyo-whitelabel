/**
 * @jest-environment node
 */

/**
 * The end-to-end run every previous phase said it still needed.
 *
 * Phases 4B–7 proved the inventory chain with Supabase mocked, and every
 * evidence report closed with the same gap: `processStockLevelChanges` had
 * never actually run against a live tenant. Three of Phase 7's bugs lived in
 * module seams precisely because nothing exercised the assembly, so the last
 * unmocked layer — the database itself — is worth closing too.
 *
 * This drives the REAL application entry points (`applyOrderStockBestEffort`,
 * `reverseOrderStockBestEffort`) against the REAL platform Supabase, on a
 * tenant's own data, and asserts what the ledger trigger, the alert rules and
 * auto-86 actually did.
 *
 * OPT-IN. It is excluded from `npm test` by the guard below because it writes
 * to production and needs a service-role key. Run it deliberately:
 *
 *   RUN_LIVE_INVENTORY_E2E=1 npx jest tests/integration/inventory-live-e2e.test.ts
 *
 * SAFETY. Everything it creates is prefixed `E2E_PROBE_` and deleted in
 * `afterAll`, which also restores the tenant's inventory flags to whatever they
 * were. It never touches an existing menu item, ingredient or recipe: the dish
 * it 86s is one it created itself. The final test re-reads the tenant and fails
 * if anything it made survived or any pre-existing count moved.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  applyOrderStockBestEffort,
  reverseOrderStockBestEffort,
} from '@/lib/inventory/order-stock-service'

const LIVE = process.env.RUN_LIVE_INVENTORY_E2E === '1'
const describeLive = LIVE ? describe : describe.skip

/**
 * `.env.test` deliberately points the unit suite at `https://test.supabase.co`,
 * and Next's jest loader gives it priority over `.env.local`. Without this the
 * run resolves the dummy host and every call dies as an opaque "fetch failed"
 * — it looks like a network problem and is actually a config one.
 *
 * Read here rather than exported to the shell so the credentials never sit in
 * a command line or a process listing.
 */
function loadRealCredentials(): void {
  const env = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8')
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const match = env.match(new RegExp(`^${key}=(.*)$`, 'm'))
    if (!match) throw new Error(`${key} missing from .env.local`)
    process.env[key] = match[1].trim()
  }
}

if (LIVE) loadRealCredentials()

const TENANT_SLUG = process.env.E2E_TENANT_SLUG ?? 'cafejuancho'
const PREFIX = 'E2E_PROBE_'
const ORDER_ID = `${PREFIX}order`

/** The recipe we assume for the probe dish: one dish eats the whole shelf. */
const STOCK_ON_HAND = 500
const REORDER_LEVEL = 100
const GRAMS_PER_DISH = 500

const supabase = createAdminClient()

const created = {
  tenantId: '',
  unitId: '',
  ingredientId: '',
  menuItemId: '',
  categoryId: '',
  recipeId: '',
  /** Flags as we found them, restored on the way out. */
  originalFlags: null as null | Record<string, boolean>,
}

interface Snapshot {
  menuItems: number
  available: number
  markers: number
  ingredients: number
  movements: number
  alerts: number
}

async function snapshot(tenantId: string): Promise<Snapshot> {
  const count = async (table: string, apply?: (q: never) => unknown) => {
    let query = supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
    if (apply) query = apply(query as never) as typeof query
    const { count: n } = await query
    return n ?? 0
  }

  return {
    menuItems: await count('menu_items'),
    available: await count('menu_items', (q: never) =>
      (q as { eq: (c: string, v: boolean) => unknown }).eq('is_available', true),
    ),
    markers: await count('menu_items', (q: never) =>
      (q as { not: (c: string, o: string, v: null) => unknown }).not(
        'auto_disabled_at',
        'is',
        null,
      ),
    ),
    ingredients: await count('inventory_items'),
    movements: await count('stock_movements'),
    alerts: await count('stock_alerts'),
  }
}

async function readProbeDish() {
  const { data } = await supabase
    .from('menu_items')
    .select('is_available, auto_disabled_at')
    .eq('id', created.menuItemId)
    .single()
  return data as unknown as { is_available: boolean; auto_disabled_at: string | null }
}

async function readIngredientQty(): Promise<number> {
  const { data } = await supabase
    .from('inventory_items')
    .select('current_qty')
    .eq('id', created.ingredientId)
    .single()
  return Number((data as unknown as { current_qty: number }).current_qty)
}

async function readOpenAlert() {
  const { data } = await supabase
    .from('stock_alerts')
    .select('level, quantity, resolved_at')
    .eq('inventory_item_id', created.ingredientId)
    .order('created_at', { ascending: false })
    .limit(1)
  const rows = (data ?? []) as unknown as Array<{
    level: string
    quantity: number
    resolved_at: string | null
  }>
  return rows[0] ?? null
}

let before: Snapshot

beforeAll(async () => {
  if (!LIVE) return

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('id, inventory_enabled, low_stock_alerts_enabled, auto_86_enabled')
    .eq('slug', TENANT_SLUG)
    .single()

  const tenant = tenantRow as unknown as {
    id: string
    inventory_enabled: boolean
    low_stock_alerts_enabled: boolean
    auto_86_enabled: boolean
  }
  created.tenantId = tenant.id
  created.originalFlags = {
    inventory_enabled: tenant.inventory_enabled,
    low_stock_alerts_enabled: tenant.low_stock_alerts_enabled,
    auto_86_enabled: tenant.auto_86_enabled,
  }

  before = await snapshot(tenant.id)

  // --- seed -----------------------------------------------------------------
  const insertOne = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from(table)
      .insert(row as never)
      .select('id')
      .single()
    if (error) throw new Error(`seed ${table}: ${error.message}`)
    return (data as unknown as { id: string }).id
  }

  created.unitId = await insertOne('inventory_units', {
    tenant_id: tenant.id,
    name: `${PREFIX}Gram`,
    abbreviation: `${PREFIX}g`,
    dimension: 'weight',
    to_base_factor: 1,
    is_base: true,
  })

  created.ingredientId = await insertOne('inventory_items', {
    tenant_id: tenant.id,
    name: `${PREFIX}Mozzarella`,
    stock_unit_id: created.unitId,
    reorder_level: REORDER_LEVEL,
  })

  // The ledger owns the quantity: `current_qty` is trigger-maintained, so the
  // opening stock is a `receive` movement, exactly as a merchant would enter it.
  await supabase.from('stock_movements').insert({
    tenant_id: tenant.id,
    inventory_item_id: created.ingredientId,
    quantity_delta: STOCK_ON_HAND,
    reason: 'receive',
  } as never)

  created.categoryId = await insertOne('categories', {
    tenant_id: tenant.id,
    name: `${PREFIX}Category`,
    order: 9999,
    // Kept out of the storefront's category rail. The dish is still reachable
    // in an "All" view, which is why the whole run is seconds long and this
    // tenant is dormant (3 orders ever, none since March).
    is_active: false,
  })

  created.menuItemId = await insertOne('menu_items', {
    tenant_id: tenant.id,
    category_id: created.categoryId,
    name: `${PREFIX}Do Not Order`,
    description: 'Internal inventory verification. Deleted automatically.',
    price: 1,
    image_url: '',
    is_available: true,
    order: 9999,
  })

  created.recipeId = await insertOne('recipes', {
    tenant_id: tenant.id,
    target_type: 'menu_item',
    menu_item_id: created.menuItemId,
  })

  await supabase.from('recipe_components').insert({
    tenant_id: tenant.id,
    recipe_id: created.recipeId,
    inventory_item_id: created.ingredientId,
    quantity: GRAMS_PER_DISH,
    unit_id: created.unitId,
    sort_order: 0,
  } as never)

  // Only now switch the features on. Cafe Juancho's own 65 dishes have no
  // recipes, so nothing but the probe dish can deplete, alert or be 86'd.
  await supabase
    .from('tenants')
    .update({
      inventory_enabled: true,
      low_stock_alerts_enabled: true,
      auto_86_enabled: true,
    } as never)
    .eq('id', tenant.id)
}, 60_000)

afterAll(async () => {
  if (!LIVE || !created.tenantId) return

  if (created.originalFlags) {
    await supabase
      .from('tenants')
      .update(created.originalFlags as never)
      .eq('id', created.tenantId)
  }

  // Children first — stock_alerts and recipe_components have FKs.
  await supabase.from('stock_alerts').delete().eq('tenant_id', created.tenantId)
  await supabase.from('stock_movements').delete().eq('tenant_id', created.tenantId)
  if (created.recipeId) {
    await supabase.from('recipe_components').delete().eq('recipe_id', created.recipeId)
    await supabase.from('recipes').delete().eq('id', created.recipeId)
  }
  if (created.menuItemId) await supabase.from('menu_items').delete().eq('id', created.menuItemId)
  if (created.categoryId) await supabase.from('categories').delete().eq('id', created.categoryId)
  if (created.ingredientId) {
    await supabase.from('inventory_items').delete().eq('id', created.ingredientId)
  }
  if (created.unitId) await supabase.from('inventory_units').delete().eq('id', created.unitId)
}, 60_000)

describeLive(`inventory end to end against ${TENANT_SLUG}`, () => {
  it('opens with the ledger trigger having set the stock from the receive movement', async () => {
    // Proves the running total is trigger-maintained, not written by hand.
    expect(await readIngredientQty()).toBe(STOCK_ON_HAND)
  })

  it('depletes the ingredient when an order is placed', async () => {
    await applyOrderStockBestEffort(
      created.tenantId,
      ORDER_ID,
      [{ menuItemId: created.menuItemId, quantity: 1 }],
      'sale',
    )

    expect(await readIngredientQty()).toBe(0)
  })

  it('raises an out-of-stock alert for the emptied ingredient', async () => {
    const alert = await readOpenAlert()

    expect(alert).not.toBeNull()
    expect(alert?.level).toBe('out')
    expect(alert?.resolved_at).toBeNull()
  })

  it('takes the dish off the menu and stamps it as the system doing it', async () => {
    const dish = await readProbeDish()

    expect(dish.is_available).toBe(false)
    expect(dish.auto_disabled_at).not.toBeNull()
  })

  it('gives the ingredient back when the order is cancelled', async () => {
    await reverseOrderStockBestEffort(created.tenantId, ORDER_ID)

    expect(await readIngredientQty()).toBe(STOCK_ON_HAND)
  })

  it('resolves the alert, because the cancellation cleared the reorder level', async () => {
    // 500 back on a 100 reorder level is `ok`, not merely `low`, so this
    // resolves rather than being corrected to 'low'.
    const alert = await readOpenAlert()

    expect(alert?.resolved_at).not.toBeNull()
  })

  it('puts the dish back on sale and releases the marker', async () => {
    // The Phase 7 bug: this whole step did nothing, because cancellation never
    // reached the alert path at all.
    const dish = await readProbeDish()

    expect(dish.is_available).toBe(true)
    expect(dish.auto_disabled_at).toBeNull()
  })

  it('leaves the tenant exactly as it was found', async () => {
    // Runs last. `afterAll` has not fired yet, so this asserts the probe's own
    // footprint is the only difference: one dish, one ingredient, its
    // movements and its alert.
    const now = await snapshot(created.tenantId)

    expect(now.menuItems).toBe(before.menuItems + 1)
    expect(now.available).toBe(before.available + 1)
    expect(now.markers).toBe(before.markers)
    expect(now.ingredients).toBe(before.ingredients + 1)
  })
})
