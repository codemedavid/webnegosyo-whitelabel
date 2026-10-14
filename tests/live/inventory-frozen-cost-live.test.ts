/** @jest-environment node */
/**
 * LIVE parity of the database's recipe costing with costing.ts.
 *
 * The ledger trigger freezes a prep's cost, and `order_item_costs` a dish's,
 * through `inventory_recipe_cost` / `inventory_effective_unit_cost`
 * (20261012180000_inventory_frozen_cost.sql) — a line-for-line SQL mirror of
 * `computeRecipeCost`. This costs EVERY recipe of every store both ways and
 * fails on any difference above rounding, so the two cannot drift silently.
 * Read-only.
 *
 * Opt-in:
 *   INVENTORY_COST_LIVE=1 npx jest tests/live/inventory-frozen-cost-live.test.ts
 */
import fs from 'fs'
import path from 'path'

const isLive = process.env.INVENTORY_COST_LIVE === '1'

if (isLive) {
  // The test environment loads .env.test (fake hosts); a live run must use the real ones.
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (match) process.env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
}

const liveDescribe = isLive ? describe : describe.skip
const PAGE_SIZE = 1000
const RPC_BATCH = 20
/** numeric(12,4) storage rounds to 4 places; float vs numeric differs far below that. */
const TOLERANCE = 1e-6

type Admin = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>

async function readAll<T>(admin: Admin, table: string, tenantId: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from(table as never)
      .select('*')
      .eq('tenant_id', tenantId)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/** costing.ts's answer, or null where it throws (unknown ingredient/unit, cycle, bad yield). */
function jsCost(compute: () => number): number | null {
  try {
    return compute()
  } catch {
    return null
  }
}

liveDescribe('recipe costing parity: database vs costing.ts (live platform DB)', () => {
  test('every recipe of every store costs the same both ways', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const { buildCostingGraph } = await import('@/lib/inventory/graph-builder')
    const { computeRecipeCost } = await import('@/lib/inventory/costing')
    const admin = createAdminClient()

    const tenantIds = new Set<string>()
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin.from('recipes').select('tenant_id').order('id').range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      for (const row of data ?? []) tenantIds.add((row as { tenant_id: string }).tenant_id)
      if (!data || data.length < PAGE_SIZE) break
    }

    const mismatches: string[] = []
    let compared = 0

    for (const tenantId of tenantIds) {
      const [units, items, recipes, components] = await Promise.all([
        readAll(admin, 'inventory_units', tenantId),
        readAll(admin, 'inventory_items', tenantId),
        readAll(admin, 'recipes', tenantId),
        readAll(admin, 'recipe_components', tenantId),
      ])
      let graph: ReturnType<typeof buildCostingGraph> | null
      try {
        graph = buildCostingGraph(units as never, items as never, recipes as never, components as never)
      } catch {
        graph = null
      }

      const recipeIds = (recipes as Array<{ id: string }>).map((recipe) => recipe.id)
      for (let start = 0; start < recipeIds.length; start += RPC_BATCH) {
        const batch = recipeIds.slice(start, start + RPC_BATCH)
        const sqlCosts = await Promise.all(
          batch.map(async (recipeId) => {
            const { data, error: rpcError } = await admin.rpc('inventory_recipe_cost' as never, {
              p_tenant_id: tenantId,
              p_recipe_id: recipeId,
            } as never)
            if (rpcError) throw rpcError
            return data === null ? null : Number(data)
          }),
        )

        batch.forEach((recipeId, index) => {
          const expected = graph ? jsCost(() => computeRecipeCost(recipeId, graph)) : null
          const actual = sqlCosts[index]
          compared += 1
          // A whole-store graph failure (one bad unit) makes costing.ts unable
          // to cost anything; the database still costs the recipes that don't
          // touch the bad row. Only a recipe both can cost is a parity case.
          if (graph === null && actual !== null) return
          const same =
            expected === null || actual === null
              ? expected === actual
              : Math.abs(expected - actual) <= TOLERANCE * Math.max(1, Math.abs(expected))
          if (!same) mismatches.push(`${tenantId}/${recipeId}: costing.ts=${expected} db=${actual}`)
        })
      }
    }

    expect(compared).toBeGreaterThan(0)
    expect(mismatches).toEqual([])
  }, 300_000)
})
