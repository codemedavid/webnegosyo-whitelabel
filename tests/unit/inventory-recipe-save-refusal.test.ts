/**
 * A recipe save the database refused must not read as saved.
 *
 * Recipes are store-wide: every branch deducts from the same one. Since
 * 20261012170100_inventory_write_scopes.sql only a store-wide account holding
 * `menu` may change them, and a branch-locked manager's UPDATE is refused the
 * way RLS refuses an UPDATE — zero rows, no error. Without a row check the
 * service went on to clear the components (also zero rows) and, for a recipe
 * emptied of ingredients, returned success over a write that never landed.
 */

import { describe, it, expect } from '@jest/globals'
import { saveRecipeForTarget } from '@/lib/inventory/recipes-service'
import type { ProvisioningCtx } from '@/lib/provisioning/context'

const TENANT = '0dd96b60-5232-4c79-922b-0bd9022d12ba'
const EXISTING = { id: 'r-1', tenant_id: TENANT, target_type: 'menu_item', menu_item_id: 'm-1' }

type Op = 'select' | 'update' | 'delete' | 'insert'
type Result = { data: unknown; error: null }

/** A chainable PostgREST stand-in: every call returns itself; awaiting resolves by (table, op). */
function fakeClient(results: Partial<Record<string, Result>>) {
  const calls: string[] = []
  const builder = (table: string) => {
    let op: Op = 'select'
    const chain: Record<string, unknown> = {}
    const resolve = () => {
      calls.push(`${table}.${op}`)
      return results[`${table}.${op}`] ?? { data: null, error: null }
    }
    for (const method of ['eq', 'is', 'order', 'select']) {
      chain[method] = () => chain
    }
    chain.update = () => ((op = 'update'), chain)
    chain.delete = () => ((op = 'delete'), chain)
    chain.insert = () => ((op = 'insert'), chain)
    chain.maybeSingle = async () => resolve()
    chain.single = async () => resolve()
    chain.then = (onFulfilled: (value: Result) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
    return chain
  }
  return { client: { from: (table: string) => builder(table) }, calls }
}

describe('saveRecipeForTarget', () => {
  it('throws when the recipe update changed no row, before touching its ingredients', async () => {
    const { client, calls } = fakeClient({
      'recipes.select': { data: EXISTING, error: null },
      'recipes.update': { data: [], error: null },
    })

    await expect(
      saveRecipeForTarget(
        TENANT,
        { type: 'menu_item', menuItemId: 'm-1' },
        { components: [] },
        { client } as unknown as ProvisioningCtx,
      ),
    ).rejects.toThrow(/every branch/i)

    expect(calls).not.toContain('recipe_components.delete')
  })

  it('saves normally when the update landed', async () => {
    const { client, calls } = fakeClient({
      'recipes.select': { data: EXISTING, error: null },
      'recipes.update': { data: [{ id: 'r-1' }], error: null },
    })

    const saved = await saveRecipeForTarget(
      TENANT,
      { type: 'menu_item', menuItemId: 'm-1' },
      { components: [] },
      { client } as unknown as ProvisioningCtx,
    )

    expect(saved).toEqual({ recipe: EXISTING, components: [] })
    expect(calls).toContain('recipe_components.delete')
  })
})
