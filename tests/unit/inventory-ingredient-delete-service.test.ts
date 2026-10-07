/**
 * The ingredient delete goes through ONE database function, never a bare
 * DELETE: the bare one was refused for every ingredient in a recipe and
 * cascaded away the stock ledger of every other one.
 */

import { deleteIngredient, previewIngredientDelete } from '@/lib/inventory/ingredients-service'

const verifyTenantPermission = jest.fn<Promise<void>, unknown[]>(() => Promise.resolve())
jest.mock('@/lib/admin-service', () => ({
  verifyTenantPermission: (...a: unknown[]) => verifyTenantPermission(...a),
}))

const rpc = jest.fn()
const from = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({ rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) }),
}))

const TENANT = '44444444-4444-4444-8444-444444444444'
const RICE = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  rpc.mockReset()
  from.mockReset()
  verifyTenantPermission.mockClear()
})

describe('deleteIngredient', () => {
  it('asks the database function to do it, never a bare DELETE', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'deleted', recipe_count: 2, recipe_lines_removed: 2 }, error: null })

    const result = await deleteIngredient(RICE, TENANT)

    expect(rpc).toHaveBeenCalledWith('delete_inventory_item', {
      p_tenant_id: TENANT, p_item_id: RICE, p_dry_run: false,
    })
    expect(from).not.toHaveBeenCalled()
    expect(result).toEqual({ outcome: 'deleted', recipeCount: 2, recipeLinesRemoved: 2 })
  })

  it('checks the delete permission first', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'archived', recipe_count: 0, recipe_lines_removed: 0 }, error: null })

    await deleteIngredient(RICE, TENANT)

    expect(verifyTenantPermission).toHaveBeenCalledWith(TENANT, 'menu', 'delete')
  })

  it('says plainly when the ingredient is already gone', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'inventory item not found' } })

    await expect(deleteIngredient(RICE, TENANT)).rejects.toThrow(/no longer exists/i)
  })

  it('passes any other refusal up', async () => {
    const refusal = { code: '42501', message: 'not allowed' }
    rpc.mockResolvedValue({ data: null, error: refusal })

    await expect(deleteIngredient(RICE, TENANT)).rejects.toBe(refusal)
  })
})

describe('previewIngredientDelete', () => {
  it('asks the same function for a dry run', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'archived', recipe_count: 1, recipe_lines_removed: 0 }, error: null })

    const result = await previewIngredientDelete(RICE, TENANT)

    expect(rpc).toHaveBeenCalledWith('delete_inventory_item', {
      p_tenant_id: TENANT, p_item_id: RICE, p_dry_run: true,
    })
    expect(result).toEqual({ outcome: 'archived', recipeCount: 1, recipeLinesRemoved: 0 })
  })
})
